export interface VersionedAnswer {
  questionId: string;
  answerData: unknown;
  version: number;
  mutationId: string | null;
}

export type SaveState = 'unanswered' | 'saved' | 'pending' | 'sending' | 'retry' | 'failed' | 'conflict';
export interface PendingAnswer extends VersionedAnswer {
  mutationId: string;
  state: Exclude<SaveState, 'unanswered' | 'saved'>;
  attempts: number;
  nextAttemptAt: number;
  message: string;
  retryable: boolean;
  currentAnswer?: VersionedAnswer;
}
export interface SyncSnapshot {
  answers: Record<string, unknown>;
  states: Record<string, SaveState>;
  pending: Record<string, PendingAnswer>;
  pendingCount: number;
  sending: boolean;
  storageWarning: string | null;
  recoveryError: boolean;
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface Options {
  sessionId: string;
  questionIds: string[];
  existingAnswers: VersionedAnswer[];
  storage: StorageLike;
  send: (answer: PendingAnswer, signal: AbortSignal) => Promise<Response>;
  online: () => boolean;
  canSend?: () => boolean;
  onChange: (snapshot: SyncSnapshot) => void;
  onClosed: (session: unknown) => void;
  onAuthError: (message: string) => void;
  now?: () => number;
  random?: () => number;
  id?: () => string;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

export function answerMutationId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

const MAX_ATTEMPTS = 5;
const MAX_VERSION = 2147483647;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const same = (a: VersionedAnswer | undefined | null, b: VersionedAnswer) => a?.version === b.version && a?.mutationId === b.mutationId;
const validVersion = (value: unknown): value is VersionedAnswer => {
  if (!value || typeof value !== 'object') return false;
  const answer = value as VersionedAnswer;
  return typeof answer.questionId === 'string' && Object.hasOwn(answer, 'answerData') &&
    Number.isInteger(answer.version) && answer.version >= 0 && answer.version <= MAX_VERSION &&
    (answer.version === 0 ? answer.mutationId === null : typeof answer.mutationId === 'string' && /^[A-Za-z0-9:_-]{16,128}$/.test(answer.mutationId));
};

/** Durable outbox: each question has its own record; old acknowledgements may remove
 * only the exact version they sent. No queue snapshot is ever written back wholesale. */
export class AnswerSync {
  private readonly confirmed = new Map<string, VersionedAnswer>();
  private readonly pending = new Map<string, PendingAnswer>();
  private readonly versions = new Map<string, number>();
  private readonly questionIds: Set<string>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly id: () => string;
  private readonly setTimer: NonNullable<Options['setTimer']>;
  private readonly clearTimer: NonNullable<Options['clearTimer']>;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private stopped = false;
  private paused = false;
  private storageWarning: string | null = null;
  private recoveryError = false;

  private readonly options: Options;

  constructor(options: Options) {
    this.options = options;
    this.questionIds = new Set(options.questionIds);
    this.now = options.now || Date.now;
    this.random = options.random || Math.random;
    this.id = options.id || answerMutationId;
    this.setTimer = options.setTimer || ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer = options.clearTimer || (timer => clearTimeout(timer));
    for (const answer of options.existingAnswers) {
      if (validVersion(answer) && this.questionIds.has(answer.questionId)) {
        this.learn(answer);
      }
    }
    for (const questionId of this.questionIds) {
      const receipt = this.receipt(questionId);
      if (receipt) this.learn(receipt);
      const record = this.read(questionId);
      if (record) this.restore(record);
    }
    this.restoreLegacy();
    this.emit();
  }

  private key(questionId: string) { return `tka_outbox_v1_${encodeURIComponent(this.options.sessionId)}_${encodeURIComponent(questionId)}`; }
  private receiptKey(questionId: string) { return `tka_receipt_v1_${encodeURIComponent(this.options.sessionId)}_${encodeURIComponent(questionId)}`; }
  private receipt(questionId: string): VersionedAnswer | null {
    try {
      const raw = this.options.storage.getItem(this.receiptKey(questionId));
      if (!raw) return null;
      const value = JSON.parse(raw);
      return validVersion(value) && value.questionId === questionId ? value : null;
    } catch { this.warn(); return null; }
  }
  private learn(server: VersionedAnswer) {
    const receipt = this.receipt(server.questionId);
    const known = this.confirmed.get(server.questionId);
    let latest = server;
    for (const value of [receipt, known]) if (value && value.version > latest.version) latest = value;
    latest = { questionId: latest.questionId, answerData: structuredClone(latest.answerData), version: latest.version, mutationId: latest.mutationId };
    this.confirmed.set(server.questionId, structuredClone(latest));
    this.versions.set(server.questionId, Math.max(this.versions.get(server.questionId) || 0, latest.version));
    try { this.options.storage.setItem(this.receiptKey(server.questionId), JSON.stringify(latest)); }
    catch { this.warn(); }
  }
  private warn() { this.storageWarning = 'Cadangan perangkat tidak tersedia. Jangan tutup halaman sebelum jawaban dikonfirmasi server.'; }
  private read(questionId: string): PendingAnswer | null {
    let raw: string | null;
    try { raw = this.options.storage.getItem(this.key(questionId)); }
    catch { this.warn(); return null; }
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as PendingAnswer;
      if (!validVersion(value) || value.version < 1 || value.questionId !== questionId ||
          !['pending', 'sending', 'retry', 'failed', 'conflict'].includes(value.state) ||
          !Number.isInteger(value.attempts) || value.attempts < 0 || value.attempts > MAX_ATTEMPTS ||
          !Number.isFinite(value.nextAttemptAt) || typeof value.retryable !== 'boolean' || typeof value.message !== 'string' ||
          (value.currentAnswer !== undefined && (!validVersion(value.currentAnswer) || value.currentAnswer.questionId !== questionId))) throw new Error('Invalid outbox');
      return value;
    } catch {
      this.recoveryError = true;
      this.storageWarning = 'Cadangan jawaban tidak dapat dibaca. Jangan hapus data perangkat; periksa bersama pengawas sebelum menyelesaikan ujian.';
      return null;
    }
  }
  private persist(record: PendingAnswer) {
    try { this.options.storage.setItem(this.key(record.questionId), JSON.stringify(record)); }
    catch { this.warn(); }
  }
  private remove(record: PendingAnswer) {
    // A delayed response cannot delete another tab's or a newer local selection.
    const disk = this.read(record.questionId);
    if (disk && !same(disk, record)) return;
    try { this.options.storage.removeItem(this.key(record.questionId)); }
    catch { this.warn(); }
  }
  private restore(record: PendingAnswer) {
    this.versions.set(record.questionId, Math.max(this.versions.get(record.questionId) || 0, record.version));
    const server = this.confirmed.get(record.questionId);
    if (server && same(server, record)) {
      if (same(this.pending.get(record.questionId), record)) this.pending.delete(record.questionId);
      this.remove(record);
      return;
    }
    if (server && record.version <= server.version) {
      record = { ...record, state: 'conflict', currentAnswer: server, message: 'Ada jawaban berbeda di server. Pilih jawaban yang akan digunakan.', retryable: false };
    } else if (record.state === 'sending') record = { ...record, state: record.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', retryable: true, nextAttemptAt: this.now(), message: record.attempts >= MAX_ATTEMPTS ? 'Pengiriman terakhir belum dikonfirmasi. Coba kirim ulang.' : '' };
    this.pending.set(record.questionId, record);
    this.persist(record);
  }
  private restoreLegacy() {
    // P0 used a queue array and a separate backup. Never guess whether an unversioned
    // backup is newer than a different answer already confirmed on the server.
    try {
      const queueRaw = this.options.storage.getItem(`tka_queue_${this.options.sessionId}`);
      const backupRaw = this.options.storage.getItem(`tka_answers_${this.options.sessionId}`);
      const legacy = new Map<string, unknown>();
      if (backupRaw) {
        const backup = JSON.parse(backupRaw);
        if (backup.byQuestionId && typeof backup.byQuestionId === 'object') {
          for (const [questionId, answer] of Object.entries(backup.byQuestionId)) legacy.set(questionId, answer);
        }
      }
      if (queueRaw) {
        const queue = JSON.parse(queueRaw);
        if (!Array.isArray(queue)) throw new Error('Invalid legacy queue');
        for (const item of queue) {
          if (!item || typeof item.questionId !== 'string' || !Object.hasOwn(item, 'answerData')) throw new Error('Invalid legacy item');
          legacy.set(item.questionId, item.answerData);
        }
      }
      for (const [questionId, answerData] of legacy) {
        if (!this.questionIds.has(questionId) || this.pending.has(questionId)) continue;
        const server = this.confirmed.get(questionId);
        if (server && equal(server.answerData, answerData)) continue;
        const record = this.makeRecord(questionId, answerData);
        if (server) Object.assign(record, { state: 'conflict', currentAnswer: server, retryable: false, message: 'Cadangan lama berbeda dari server. Pilih jawaban yang akan digunakan.' });
        this.pending.set(questionId, record);
        this.persist(record);
      }
      // Remove old snapshots only after all their pending entries are durable.
      if (!this.storageWarning) {
        this.options.storage.removeItem(`tka_queue_${this.options.sessionId}`);
        this.options.storage.removeItem(`tka_answers_${this.options.sessionId}`);
      }
    } catch { this.warn(); this.recoveryError = true; }
  }

  private makeRecord(questionId: string, answerData: unknown): PendingAnswer {
    const disk = this.read(questionId);
    const version = Math.max(this.versions.get(questionId) || 0, this.confirmed.get(questionId)?.version || 0, disk?.version || 0) + 1;
    if (version > MAX_VERSION) throw new Error('Versi jawaban telah mencapai batas. Hubungi pengawas.');
    this.versions.set(questionId, version);
    return { questionId, answerData: structuredClone(answerData), version, mutationId: this.id(), state: 'pending', attempts: 0, nextAttemptAt: this.now() + 150, message: '', retryable: true };
  }

  enqueue(questionId: string, answerData: unknown) {
    if (this.stopped || this.paused || !this.questionIds.has(questionId)) return;
    const record = this.makeRecord(questionId, answerData);
    this.pending.set(questionId, record);
    this.persist(record); // Persist first, including changes made while another request is in flight.
    this.emit();
    this.wake();
  }

  snapshot(): SyncSnapshot {
    const answers: Record<string, unknown> = {}, states: Record<string, SaveState> = {}, pending: Record<string, PendingAnswer> = {};
    for (const questionId of this.questionIds) {
      const server = this.confirmed.get(questionId), local = this.pending.get(questionId);
      states[questionId] = local?.state || (server ? 'saved' : 'unanswered');
      if (server) answers[questionId] = structuredClone(server.answerData);
      if (local) { answers[questionId] = structuredClone(local.answerData); pending[questionId] = structuredClone(local); }
    }
    return { answers, states, pending, pendingCount: this.pending.size, sending: [...this.pending.values()].some(record => record.state === 'sending'), storageWarning: this.storageWarning, recoveryError: this.recoveryError };
  }
  private emit() { if (!this.stopped) this.options.onChange(this.snapshot()); }
  manifest() { return [...this.confirmed.values()].map(({ questionId, version, mutationId }) => ({ questionId, version, mutationId })); }

  /** Adopts a newer per-question entry from another page without replacing the rest. */
  refresh() {
    if (this.stopped) return;
    for (const questionId of this.questionIds) {
      const receipt = this.receipt(questionId);
      if (receipt) this.learn(receipt);
      const queued = this.pending.get(questionId);
      if (receipt && queued && same(receipt, queued)) {
        this.pending.delete(questionId);
        this.remove(queued);
      }
      const disk = this.read(questionId), local = this.pending.get(questionId);
      if (disk && !same(disk, local || { version: -1, mutationId: null, questionId, answerData: null }) && disk.version >= (local?.version || 0)) this.restore(disk);
    }
    this.emit();
    this.wake();
  }

  private update(record: PendingAnswer, change: Partial<PendingAnswer>) {
    const disk = this.read(record.questionId);
    if (disk && !same(disk, record) && disk.version >= record.version) {
      this.restore(disk);
      this.emit();
      return;
    }
    const local = this.pending.get(record.questionId);
    if (!same(local, record)) return;
    const next = { ...local!, ...change };
    this.pending.set(record.questionId, next);
    this.persist(next);
    this.emit();
  }

  private acknowledge(record: PendingAnswer, server: VersionedAnswer) {
    this.learn(server);
    const disk = this.read(record.questionId);
    if (disk && !same(disk, record) && disk.version >= record.version) this.restore(disk);
    if (same(this.pending.get(record.questionId), record)) {
      this.pending.delete(record.questionId);
      this.remove(record);
    }
    this.emit();
  }

  private fail(record: PendingAnswer, message: string, retryable: boolean, retryAfter = 0) {
    const attempts = record.attempts;
    const delay = Math.min(300000, Math.max(retryAfter, Math.min(30000, 1000 * 2 ** (attempts - 1) + Math.floor(this.random() * 250))));
    this.update(record, { attempts, state: retryable && attempts < MAX_ATTEMPTS ? 'retry' : 'failed', message, retryable, nextAttemptAt: this.now() + delay });
  }

  private async send(record: PendingAnswer) {
    record = { ...record, attempts: record.attempts + 1 };
    this.update(record, { state: 'sending', attempts: record.attempts, message: '' });
    if (!same(this.pending.get(record.questionId), record)) return;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = this.setTimer(() => controller.abort(), 15000);
    try {
      const response = await this.options.send(record, controller.signal);
      const body = await response.json().catch(() => ({}));
      if (this.stopped) return;
      if (response.ok) {
        if (!validVersion(body) || !same(body, record) || body.questionId !== record.questionId || !('acknowledged' in body) || body.acknowledged !== true) {
          this.fail(record, 'Konfirmasi server tidak cocok. Jawaban belum dianggap tersimpan.', true);
        } else this.acknowledge(record, body);
      } else if (response.status === 409 && body.session?.status === 'selesai') {
        this.paused = true;
        this.options.onClosed(body.session);
      } else if (response.status === 409 && body.error === 'ANSWER_VERSION_CONFLICT' && validVersion(body.currentAnswer) && body.currentAnswer.questionId === record.questionId) {
        const server = body.currentAnswer as VersionedAnswer;
        this.learn(server);
        if (equal(server.answerData, record.answerData)) this.acknowledge(record, server);
        else this.update(record, { state: 'conflict', currentAnswer: server, retryable: false, message: 'Jawaban di server berbeda. Pilih jawaban yang akan digunakan.' });
      } else if (response.status === 401) {
        this.update(record, { state: 'failed', retryable: false, message: 'Sesi login tidak aktif. Cadangan jawaban dipertahankan.' });
        this.paused = true;
        this.options.onAuthError(body.message || 'Silakan login kembali.');
      } else {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        const header = response.headers.get('Retry-After');
        const seconds = header === null ? 0 : Number(header);
        const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header || '') - this.now();
        this.fail(record, body.message || (retryable ? 'Server belum dapat menyimpan jawaban.' : 'Jawaban ditolak server. Periksa pilihan Anda.'), retryable, Number.isFinite(delay) ? Math.max(0, delay) : 0);
      }
    } catch {
      if (!this.stopped) this.fail(record, 'Pengiriman belum dikonfirmasi. Menunggu percobaan berikutnya.', true);
    } finally {
      this.clearTimer(timeout);
      if (this.controller === controller) this.controller = null;
    }
  }

  private async drain() {
    const started = this.now();
    let count = 0;
    while (!this.stopped && !this.paused && this.options.online() && this.options.canSend?.() !== false && count++ < 16 && this.now() - started < 5000) {
      const next = [...this.pending.values()].find(record => ['pending', 'retry'].includes(record.state) && record.nextAttemptAt <= this.now());
      if (!next) break;
      await this.send({ ...next });
    }
  }

  wake() {
    if (this.timer !== undefined) { this.clearTimer(this.timer); this.timer = undefined; }
    if (this.stopped || this.paused || !this.options.online() || this.options.canSend?.() === false || this.running) return;
    const due = [...this.pending.values()].filter(record => ['pending', 'retry'].includes(record.state)).map(record => record.nextAttemptAt);
    if (!due.length) return;
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      void this.run();
    }, Math.max(0, Math.min(...due) - this.now()));
  }
  private run() {
    if (this.running) return this.running;
    const task = this.drain().finally(() => { this.running = null; this.wake(); });
    this.running = task;
    return task;
  }
  async flush() {
    if (this.stopped || this.paused) return this.snapshot();
    this.refresh();
    // A manual finish may request one immediate attempt, but does not reset failed
    // retries or auto-resolve conflicts. Later failures retain their backoff.
    for (const record of this.pending.values()) {
      if (['pending', 'retry'].includes(record.state)) this.update(record, { nextAttemptAt: this.now() });
    }
    if (this.running) await this.running;
    await this.run();
    return this.snapshot();
  }
  retry() {
    if (this.stopped || this.paused) return;
    for (const record of this.pending.values()) {
      if (record.retryable && record.state !== 'sending') this.update(record, { attempts: 0, state: 'pending', nextAttemptAt: this.now(), message: '' });
    }
    this.wake();
  }
  resolve(questionId: string, choice: 'server' | 'local') {
    const record = this.pending.get(questionId);
    if (!record || record.state !== 'conflict' || !record.currentAnswer) return;
    if (choice === 'local') this.enqueue(questionId, record.answerData);
    else this.acknowledge(record, record.currentAnswer);
  }
  complete() {
    this.dispose();
    for (const questionId of this.questionIds) {
      try { this.options.storage.removeItem(this.key(questionId)); } catch { /* Server already finalized. */ }
      try { this.options.storage.removeItem(this.receiptKey(questionId)); } catch { /* Best effort cleanup. */ }
    }
    for (const prefix of ['tka_queue_', 'tka_answers_']) {
      try { this.options.storage.removeItem(prefix + this.options.sessionId); } catch { /* Best effort cleanup. */ }
    }
    this.pending.clear();
  }
  dispose() {
    this.stopped = true;
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.controller?.abort();
  }
}
