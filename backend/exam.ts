import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { getOrSetCache, invalidateExamCache } from './cache.js';

type Tx = Prisma.TransactionClient;
type QuestionSpec = { type: string; options: unknown; correctAnswer: unknown };
const ACTIVE = 'sedang_mengerjakan';
const FINISHED = 'selesai';
const SIMPLE = 'Pilihan Ganda Sederhana';
const MULTIPLE = 'Pilihan Ganda Kompleks';
const CATEGORY = 'Pilihan Ganda Kompleks Kategori';

export class ExamError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const invalid = (message: string): never => { throw new ExamError(400, 'INVALID_ANSWER', message); };

export function normalizeAnswer(question: Pick<QuestionSpec, 'type' | 'options'>, answer: unknown): Prisma.InputJsonValue | null {
  const count = Array.isArray(question.options) ? question.options.length : 0;
  if (!count) return invalid('Soal tidak memiliki opsi yang valid.');
  if (answer === null) return null;
  if (question.type === SIMPLE) {
    if (!Number.isInteger(answer) || (answer as number) < 0 || (answer as number) >= count) {
      return invalid('Jawaban pilihan tunggal harus berupa indeks opsi yang valid.');
    }
    return answer as number;
  }
  if (!Array.isArray(answer)) return invalid('Jawaban harus berupa array.');
  if (question.type === MULTIPLE) {
    if (answer.length > count || new Set(answer).size !== answer.length ||
        !answer.every(value => Number.isInteger(value) && value >= 0 && value < count)) {
      return invalid('Pilihan jawaban harus unik dan berada dalam rentang opsi.');
    }
    return [...answer].sort((a, b) => a - b);
  }
  if (question.type === CATEGORY) {
    if (answer.length > count || !answer.every(value => value === null || value === 0 || value === 1)) {
      return invalid('Jawaban kategori hanya menerima 0, 1, atau null untuk pernyataan yang belum dijawab.');
    }
    return Array.from({ length: count }, (_, index) => answer[index] ?? null);
  }
  return invalid('Tipe soal tidak didukung.');
}

export function validQuestion(question: QuestionSpec): boolean {
  if (!Array.isArray(question.options) || question.options.length < (question.type === CATEGORY ? 1 : 2) ||
      !Array.isArray(question.correctAnswer)) return false;
  const key = question.correctAnswer;
  try {
    if (question.type === SIMPLE) return key.length === 1 && normalizeAnswer(question, key[0]) !== null;
    if (question.type === MULTIPLE) return key.length > 0 && Array.isArray(normalizeAnswer(question, key));
    return question.type === CATEGORY && key.length === question.options.length &&
      key.every(value => value === 0 || value === 1);
  } catch { return false; }
}

export function gradeAnswer(question: QuestionSpec, answer: unknown): boolean {
  if (!validQuestion(question)) return false;
  try {
    const normalized = normalizeAnswer(question, answer);
    if (normalized === null) return false;
    const key = question.correctAnswer as number[];
    if (question.type === SIMPLE) return normalized === key[0];
    const expected = question.type === MULTIPLE ? [...key].sort((a, b) => a - b) : key;
    return JSON.stringify(normalized) === JSON.stringify(expected);
  } catch { return false; }
}

export const examTransaction = <T>(prisma: PrismaClient, action: (tx: Tx) => Promise<T>) =>
  prisma.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 15000 });

// Shared starts can proceed together. Content edits take the exclusive counterpart,
// preventing a first session racing with an edit/deletion of its package or bank.
export async function lockExamContent(tx: Tx, editing: boolean) {
  if (editing) await tx.$queryRaw`SELECT pg_advisory_xact_lock(84721, 1)::text`;
  else await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(84721, 1)::text`;
}

async function databaseNow(tx: Tx): Promise<Date> {
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  if (!row) throw new Error('Database clock unavailable');
  return row.now;
}

async function lockedSession(tx: Tx, sessionId: string, studentId?: string) {
  // Every answer/finalizer uses this same DB row lock across all processes/servers.
  await tx.$queryRaw`SELECT id FROM "ExamSession" WHERE id = ${sessionId} FOR UPDATE`;
  const session = await tx.examSession.findUnique({ where: { id: sessionId }, include: { package: true } });
  if (!session || (studentId && session.studentId !== studentId)) throw new ExamError(403, 'FORBIDDEN', 'Sesi bukan milik Anda.');
  return session;
}
type Session = NonNullable<Awaited<ReturnType<typeof lockedSession>>>;

export function deadlineFor(session: { startTime: Date; package: { durationMinutes: number } }): Date {
  const duration = session.package.durationMinutes;
  if (!Number.isInteger(duration) || duration <= 0 || !Number.isFinite(session.startTime.getTime())) {
    throw new ExamError(409, 'INVALID_EXAM_CONFIG', 'Durasi atau waktu mulai ujian tidak valid.');
  }
  return new Date(session.startTime.getTime() + duration * 60000);
}

function summary(session: Session) {
  return {
    id: session.id, studentId: session.studentId, packageId: session.packageId,
    releaseScoreMode: session.package.releaseScoreMode,
    status: session.status, startTime: session.startTime, endTime: session.endTime,
    totalScore: session.package.releaseScoreMode === 'langsung' ? session.totalScore : null,
  };
}

async function finalize(tx: Tx, session: Session, now: Date): Promise<Session> {
  if (session.status === FINISHED) return session;
  if (session.status !== ACTIVE) throw new ExamError(409, 'EXAM_CLOSED', 'Sesi tidak menerima perubahan.');
  const [items, answers] = await Promise.all([
    tx.packageQuestion.findMany({ where: { packageId: session.packageId }, include: { question: true } }),
    tx.answer.findMany({ where: { sessionId: session.id } }),
  ]);
  const specs = new Map(items.map(item => [item.questionId, item.question]));
  const correctIds = answers.filter(answer => {
    const question = specs.get(answer.questionId);
    return question && gradeAnswer(question, answer.answerData);
  }).map(answer => answer.id);
  // Both correctness flags and session score commit together. Foreign legacy answers
  // are marked false and cannot inflate the numerator beyond the package size.
  await tx.answer.updateMany({ where: { sessionId: session.id }, data: { isCorrect: false } });
  if (correctIds.length) await tx.answer.updateMany({ where: { sessionId: session.id, id: { in: correctIds } }, data: { isCorrect: true } });
  const deadline = deadlineFor(session);
  const updated = await tx.examSession.update({
    where: { id: session.id },
    data: {
      status: FINISHED,
      endTime: new Date(Math.min(now.getTime(), deadline.getTime())),
      totalScore: items.length ? correctIds.length / items.length * 100 : 0,
    },
  });
  return { ...updated, package: session.package };
}

export async function startExam(prisma: PrismaClient, studentId: string, token: unknown) {
  if (typeof token !== 'string' || !token.trim()) throw new ExamError(400, 'INVALID_TOKEN', 'Token ujian wajib diisi.');
  let changed = false;
  const result = await examTransaction(prisma, async tx => {
    await lockExamContent(tx, false);
    // Serialize simultaneous starts for this student/package, not the whole cohort.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(84722, hashtext(${studentId + ':' + token}))::text`;
    const pkg = await tx.package.findFirst({ where: { token } });
    if (!pkg) throw new ExamError(404, 'INVALID_TOKEN', 'Token paket tidak ditemukan.');
    let session = await tx.examSession.findUnique({ where: { studentId_packageId: { studentId, packageId: pkg.id } }, include: { package: true } });
    // Cache only after a committed session has frozen this package's content.
    // A missed Redis invalidation must never resurrect an editable pre-exam bank.
    const frozen = !!session || !!await tx.examSession.findFirst({ where: { packageId: pkg.id }, select: { id: true } });
    const items = await getOrSetCache(`exam:frozen-content:${pkg.id}`, frozen ? 300 : 0, () => tx.packageQuestion.findMany({
      where: { packageId: pkg.id }, orderBy: { questionId: 'asc' },
      include: { question: { include: { reading: true } } },
    }), ['v2:api:packages', 'v2:api:questions:all', 'v2:api:readings:all']);
    if (!session) {
      if (pkg.status !== 'aktif') throw new ExamError(403, 'EXAM_INACTIVE', 'Ujian tidak menerima peserta baru.');
      if (!Number.isInteger(pkg.durationMinutes) || pkg.durationMinutes <= 0 || !items.length || items.some(item => !validQuestion(item.question))) {
        throw new ExamError(409, 'INVALID_EXAM_CONFIG', 'Paket harus memiliki durasi, opsi, dan kunci jawaban yang valid.');
      }
      changed = true;
      session = await tx.examSession.create({ data: { studentId, packageId: pkg.id, startTime: await databaseNow(tx), status: ACTIVE }, include: { package: true } });
    }
    session = await lockedSession(tx, session.id, studentId);
    const now = await databaseNow(tx);
    const deadline = deadlineFor(session);
    if (session.status === ACTIVE && now >= deadline) { session = await finalize(tx, session, now); changed = true; }
    if (![ACTIVE, FINISHED].includes(session.status)) throw new ExamError(409, 'EXAM_CLOSED', 'Sesi tidak dapat dilanjutkan.');
    const questions = items.map(({ question: q }) => ({
      id: q.id, type: q.type, mapel: q.mapel, element: q.element, content: q.content, imageUrl: q.imageUrl, options: q.options,
      reading: q.reading ? { id: q.reading.id, title: q.reading.title, content: q.reading.content } : null
    }));
    const existingAnswers = await tx.answer.findMany({ where: { sessionId: session.id }, select: { questionId: true, answerData: true, version: true, mutationId: true } });
    const { token: _token, ...safePackage } = session.package;
    return { session: summary(session), package: safePackage, questions, existingAnswers, serverTime: now, deadline, remainingSeconds: session.status === FINISHED ? 0 : Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 1000)) };
  });
  if (changed) await invalidateExamCache(result.session.packageId);
  return result;
}

export async function saveExamAnswer(prisma: PrismaClient, studentId: string, sessionId: string, questionId: unknown, answerData: unknown, metadata: { version?: unknown; mutationId?: unknown } = {}) {
  let changedPackage: string | null = null;
  const result = await examTransaction(prisma, async tx => {
    let session = await lockedSession(tx, sessionId, studentId);
    const now = await databaseNow(tx);
    if (session.status === FINISHED) return { error: 'EXAM_CLOSED', session: summary(session) } as const;
    if (session.status !== ACTIVE) throw new ExamError(409, 'EXAM_CLOSED', 'Sesi tidak menerima jawaban.');
    if (now >= deadlineFor(session)) {
      session = await finalize(tx, session, now);
      changedPackage = session.packageId;
      // Return, rather than throw: the expiry finalization must commit before 409.
      return { error: 'EXAM_EXPIRED', session: summary(session) } as const;
    }
    if (typeof questionId !== 'string') throw new ExamError(400, 'INVALID_QUESTION', 'ID soal tidak valid.');
    const item = await tx.packageQuestion.findUnique({ where: { packageId_questionId: { packageId: session.packageId, questionId } }, include: { question: true } });
    if (!item) throw new ExamError(400, 'INVALID_QUESTION', 'Soal bukan bagian dari paket ujian.');
    const normalized = normalizeAnswer(item.question, answerData);
    const { version, mutationId } = metadata;
    if (!Number.isInteger(version) || (version as number) < 1 || (version as number) > 2147483647 ||
        typeof mutationId !== 'string' || !/^[A-Za-z0-9:_-]{16,128}$/.test(mutationId)) {
      throw new ExamError(400, 'INVALID_ANSWER_VERSION', 'Versi jawaban dan ID pengiriman wajib valid. Muat ulang aplikasi jika masih memakai versi lama.');
    }
    const previous = await tx.answer.findUnique({ where: { sessionId_questionId: { sessionId, questionId } } });
    const dto = (answer: { questionId: string; answerData: unknown; version: number; mutationId: string | null }) => ({
      questionId: answer.questionId, answerData: answer.answerData, version: answer.version, mutationId: answer.mutationId,
    });
    if (previous && (version as number) <= previous.version) {
      if (version === previous.version && mutationId === previous.mutationId && JSON.stringify(normalized) === JSON.stringify(previous.answerData)) {
        return { ...dto(previous), acknowledged: true };
      }
      return { error: 'ANSWER_VERSION_CONFLICT', message: 'Server sudah memiliki versi jawaban yang berbeda.', currentAnswer: dto(previous) } as const;
    }
    if (previous?.mutationId === mutationId) {
      return { error: 'ANSWER_VERSION_CONFLICT', message: 'ID pengiriman yang sama tidak boleh digunakan untuk perubahan baru.', currentAnswer: dto(previous) } as const;
    }
    const answer = await tx.answer.upsert({
      where: { sessionId_questionId: { sessionId, questionId } },
      create: { sessionId, questionId, answerData: normalized === null ? Prisma.JsonNull : normalized, version: version as number, mutationId },
      update: { answerData: normalized === null ? Prisma.JsonNull : normalized, isCorrect: null, version: version as number, mutationId },
    });
    return { ...dto(answer), acknowledged: true };
  });
  if (changedPackage) await invalidateExamCache(changedPackage);
  return result;
}

export async function finishExam(prisma: PrismaClient, studentId: string, sessionId: string, expectedAnswers: unknown) {
  let changedPackage: string | null = null;
  const result = await examTransaction(prisma, async tx => {
    const session = await lockedSession(tx, sessionId, studentId);
    const now = await databaseNow(tx);
    if (session.status === ACTIVE && now < deadlineFor(session)) {
      if (!Array.isArray(expectedAnswers) || expectedAnswers.length > 10000 || expectedAnswers.some(answer =>
        !answer || typeof answer.questionId !== 'string' || !Number.isInteger(answer.version) || answer.version < 0 ||
        answer.version > 2147483647 || (answer.version === 0 ? answer.mutationId !== null :
          typeof answer.mutationId !== 'string' || !/^[A-Za-z0-9:_-]{16,128}$/.test(answer.mutationId)))) {
        throw new ExamError(400, 'INVALID_ANSWER_MANIFEST', 'Daftar konfirmasi penyimpanan jawaban wajib disertakan sebelum menyelesaikan ujian.');
      }
      const stored = await tx.answer.findMany({ where: { sessionId }, select: { questionId: true, version: true, mutationId: true } });
      const versions = new Map(stored.map(answer => [answer.questionId, answer]));
      const unique = new Set(expectedAnswers.map(answer => answer.questionId));
      if (unique.size !== expectedAnswers.length || expectedAnswers.some(answer => {
        const current = versions.get(answer.questionId);
        return !current || current.version !== answer.version || current.mutationId !== answer.mutationId;
      })) throw new ExamError(409, 'ANSWERS_NOT_SYNCED', 'Jawaban terbaru belum dikonfirmasi server. Sinkronkan jawaban sebelum menyelesaikan ujian.');
    }
    if (session.status === ACTIVE) changedPackage = session.packageId;
    return summary(await finalize(tx, session, now));
  });
  if (changedPackage) await invalidateExamCache(changedPackage);
  return result;
}

/** Finalize abandoned expired sessions too, without trusting an open browser. */
export async function finalizeExpiredExams(prisma: PrismaClient, limit = 100): Promise<number> {
  const expired = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s.id FROM "ExamSession" s JOIN "Package" p ON p.id = s."packageId"
    WHERE s.status = 'sedang_mengerjakan' AND p."durationMinutes" > 0
      AND s."startTime" + p."durationMinutes" * interval '1 minute' <= clock_timestamp() AT TIME ZONE 'UTC'
    ORDER BY s."startTime" LIMIT ${limit}`;
  for (const item of expired) {
    const changed = await examTransaction(prisma, async tx => {
      const session = await lockedSession(tx, item.id);
      const now = await databaseNow(tx);
      if (session.status === ACTIVE && now >= deadlineFor(session)) { await finalize(tx, session, now); return session.packageId; }
      return null;
    });
    if (changed) await invalidateExamCache(changed);
  }
  return expired.length;
}

/** Guard mutable content before the first session freezes it. Called under exclusive content lock. */
export async function assertContentEditable(tx: Tx, kind: 'package' | 'question' | 'reading', id: string) {
  const used = await tx.examSession.findFirst({
    where: kind === 'package' ? { packageId: id } : {
      package: { questions: { some: kind === 'question' ? { questionId: id } : { question: { readingId: id } } } },
    }, select: { id: true },
  });
  if (used) throw new ExamError(409, 'EXAM_CONTENT_LOCKED', 'Konten sudah digunakan dalam ujian. Buat salinan untuk perubahan.');
}
