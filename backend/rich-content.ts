/** Shared, dependency-free contract. Stored in existing text fields; never stores raw HTML. */
export const RICH_PREFIX = 'TKA_RICH_V1:';
export interface RichNode { type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string }[]; content?: RichNode[] }
export interface RichDocument { version: 1; format: 'prose' | 'poem' | 'free'; indent: boolean; lineHeight: number; doc: RichNode }
export class RichContentError extends Error {}
export function safeImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || Array.from(value).some(char => char.charCodeAt(0) <= 32 || char === '\\')) return false;
  if (value.startsWith('/uploads/') && !value.includes('..') && !/[?#]/.test(value)) return true;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
const blocks = ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule', 'image', 'table', 'blockMath'];
const inline = ['text', 'hardBreak', 'inlineMath'];
const children: Record<string, string[]> = { doc: blocks, paragraph: inline, heading: inline, bulletList: ['listItem'], orderedList: ['listItem'], listItem: blocks, blockquote: blocks, codeBlock: ['text'], table: ['tableRow'], tableRow: ['tableHeader', 'tableCell'], tableHeader: blocks.filter(t => t !== 'table'), tableCell: blocks.filter(t => t !== 'table') };
export function validateRichDocument(input: unknown): RichDocument {
  const fail = (): never => { throw new RichContentError('Format konten soal tidak valid atau melebihi batas.'); };
  if (!input || typeof input !== 'object') return fail();
  const data = input as Record<string, unknown>;
  if (data.version !== 1 || !['prose', 'poem', 'free'].includes(String(data.format)) || typeof data.indent !== 'boolean' || ![1.6, 1.85, 2.2].includes(Number(data.lineHeight))) return fail();
  let count = 0;
  const walk = (value: unknown, depth: number, allowed: string[]): RichNode => {
    if (++count > 2000 || depth > 16 || !value || typeof value !== 'object') return fail();
    const node = value as Record<string, unknown>, type = String(node.type);
    if (!allowed.includes(type)) return fail();
    const result: RichNode = { type }, attrs = node.attrs && typeof node.attrs === 'object' ? node.attrs as Record<string, unknown> : {};
    if (type === 'text') { if (typeof node.text !== 'string' || !node.text || node.text.length > 40000) return fail(); result.text = node.text; }
    if (node.marks !== undefined) {
      if (type !== 'text' || !Array.isArray(node.marks) || node.marks.length > 5) return fail();
      result.marks = node.marks.map(mark => { if (!mark || !['bold', 'italic', 'underline', 'strike', 'code'].includes(mark.type)) return fail();return { type: mark.type }; });
    }
    const clean: Record<string, unknown> = {};
    if (['paragraph', 'heading'].includes(type)) {
      if (attrs.textAlign != null) { if (!['left', 'center', 'right', 'justify'].includes(String(attrs.textAlign))) return fail(); clean.textAlign = attrs.textAlign; }
      if (attrs.indent != null) { if (![0, 1].includes(attrs.indent as number)) return fail(); clean.indent = attrs.indent; }
    }
    if (type === 'heading') { if (![2, 3].includes(attrs.level as number)) return fail(); clean.level = attrs.level; }
    if (type === 'image') {
      if (!safeImageUrl(attrs.src)) return fail(); clean.src = attrs.src;
      clean.alt = typeof attrs.alt === 'string' ? attrs.alt.slice(0, 250) : 'Gambar';
      if (attrs.align != null) { if (!['left', 'center', 'right'].includes(String(attrs.align))) return fail(); clean.align = attrs.align; }
      if (attrs.width != null) { if (![25, 50, 75, 100].includes(attrs.width as number)) return fail(); clean.width = attrs.width; }
    }
    if (['inlineMath', 'blockMath'].includes(type)) { if (typeof attrs.latex !== 'string' || attrs.latex.length > 2000) return fail(); clean.latex = attrs.latex; }
    if (type === 'orderedList') { if (attrs.start != null && (!Number.isInteger(attrs.start) || Number(attrs.start) < 1 || Number(attrs.start) > 1000)) return fail(); clean.start = attrs.start ?? 1; }
    if (['tableCell', 'tableHeader'].includes(type)) {
      for (const key of ['colspan', 'rowspan']) { const val = attrs[key] ?? 1; if (!Number.isInteger(val) || Number(val) < 1 || Number(val) > 20) return fail(); clean[key] = val; }
    }
    if (Object.keys(clean).length) result.attrs = clean;
    if (node.content !== undefined && !Array.isArray(node.content)) return fail();
    if (children[type]) {
      result.content = (Array.isArray(node.content) ? node.content : []).map(child => walk(child, depth + 1, children[type]!));
      if (['doc', 'table', 'tableRow', 'tableHeader', 'tableCell', 'listItem'].includes(type) && !result.content.length) return fail();
      if ((type === 'table' && result.content.length > 30) || (type === 'tableRow' && result.content.length > 20)) return fail();
    } else if (Array.isArray(node.content) && node.content.length) return fail();
    return result;
  };
  const result: RichDocument = { version: 1, format: data.format as RichDocument['format'], indent: data.indent as boolean, lineHeight: Number(data.lineHeight), doc: walk(data.doc, 0, ['doc']) };
  if (JSON.stringify(result).length > 50000) return fail();
  return result;
}
export function parseRichContent(value: string): RichDocument | null {
  if (!value.startsWith(RICH_PREFIX)) return null;
  try { if (value.length > 60000) return null; return validateRichDocument(JSON.parse(value.slice(RICH_PREFIX.length))); } catch { return null; }
}
export function encodeRichContent(value: RichDocument): string {
  const valid = validateRichDocument(value), encoded = RICH_PREFIX + JSON.stringify({ text: richText(valid.doc), ...valid });
  if (encoded.length > 60000) throw new RichContentError('Konten terlalu panjang. Kurangi isi soal atau pilihan jawaban.');
  return encoded;
}
export function validateContentField(value: unknown): void {
  if (typeof value === 'string' && value.startsWith(RICH_PREFIX) && !parseRichContent(value)) throw new RichContentError('Konten berformat tidak valid. Periksa kembali editor soal.');
}
function richText(node: RichNode): string {
  return node.type === 'image' ? `[${node.attrs?.alt || 'Gambar'}]` : ['inlineMath', 'blockMath'].includes(node.type) ? String(node.attrs?.latex || '') : node.type === 'hardBreak' ? '\n' : node.text || (node.content || []).map(richText).join(node.type === 'paragraph' || node.type === 'heading' ? '' : '\n');
}
export function contentText(value: string): string {
  const rich = parseRichContent(value); return rich ? richText(rich.doc) : value.startsWith(RICH_PREFIX) ? '[Konten tidak valid]' : value;
}
export function contentHasValue(value: string): boolean {
  const rich = parseRichContent(value);
  if (!rich) return !value.startsWith(RICH_PREFIX) && !!value.trim();
  const has = (node: RichNode): boolean => node.type === 'image' || !!node.text?.trim() || ['inlineMath', 'blockMath'].includes(node.type) && !!String(node.attrs?.latex || '').trim() || (node.content || []).some(has);
  return has(rich.doc);
}
