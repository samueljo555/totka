import type { Request } from 'express';
import type { Prisma } from '@prisma/client';

export class QueryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function text(query: Request['query'], name: string): string {
  const value = query[name];
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > 200) throw new QueryError(400, `Parameter ${name} tidak valid.`);
  return value.trim();
}
export function pagination(query: Request['query']) {
  const number = (name: string, fallback: number, max: number) => {
    const value = query[name];
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) throw new QueryError(400, `Parameter ${name} tidak valid.`);
    return Number(value);
  };
  const page = number('page', 1, 100000);
  const pageSize = number('pageSize', 50, 100);
  const after = text(query, 'after');
  if (after && page !== 1) throw new QueryError(400, 'Cursor tidak dapat digabung dengan nomor halaman.');
  return { page, pageSize, after, skip: after ? 0 : (page - 1) * pageSize, take: pageSize + 1 };
}
export function pageResult<T>(rows: T[], total: number, p: ReturnType<typeof pagination>, id: (row: T) => string) {
  const hasMore = rows.length > p.pageSize;
  const items = rows.slice(0, p.pageSize);
  return { items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.max(1, Math.ceil(total / p.pageSize)), hasMore, nextCursor: hasMore && items.length ? id(items[items.length - 1]!) : null };
}
export const afterId = (after: string, field = 'id') => after ? { [field]: { gt: after } } : {};
export function studentWhere(req: Request): Prisma.UserWhereInput {
  const requested = text(req.query, 'schoolNpsn');
  const schoolNpsn = req.user!.role === 'operator' ? req.user!.schoolNpsn : requested;
  if (req.user!.role === 'operator' && requested && requested !== schoolNpsn) throw new QueryError(403, 'Sekolah tidak sesuai dengan akun operator.');
  const search = text(req.query, 'search');
  const className = text(req.query, 'className');
  return {
    role: 'siswa', ...(schoolNpsn ? { schoolNpsn } : {}), ...(className ? { className } : {}),
    ...(search ? { OR: ['fullName', 'username', 'nisn', 'className'].map(field => ({ [field]: { contains: search, mode: 'insensitive' } })) } : {}),
  };
}
