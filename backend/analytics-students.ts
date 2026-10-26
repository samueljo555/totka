import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { pagination, text, QueryError } from './pagination.js';

type StudentRow = {
  id: string | null; studentName: string; nisn: string | null; npsn: string | null; school: string | null; className: string | null;
  sessionId: string | null; sessionStatus: string | null; score: Prisma.Decimal | null; startTime: Date | null; endTime: Date | null;
  packageId: string; packageName: string; mapel: string; studentId: string;
  total: number; cursorExists: boolean;
};
const orders = {
  id: { inner: Prisma.sql`f.id ASC`, outer: Prisma.sql`p.id ASC` },
  name_asc: { inner: Prisma.sql`f."studentName" ASC, f.id ASC`, outer: Prisma.sql`p."studentName" ASC, p.id ASC` },
  name_desc: { inner: Prisma.sql`f."studentName" DESC, f.id ASC`, outer: Prisma.sql`p."studentName" DESC, p.id ASC` },
  score_desc: { inner: Prisma.sql`f.score DESC NULLS LAST, f.id ASC`, outer: Prisma.sql`p.score DESC NULLS LAST, p.id ASC` },
  score_asc: { inner: Prisma.sql`f.score ASC NULLS LAST, f.id ASC`, outer: Prisma.sql`p.score ASC NULLS LAST, p.id ASC` },
};

export async function analyticsStudents(prisma: PrismaClient, req: Request, schoolPath?: string, report: 'analytics' | 'history' | null = null) {
  const p = pagination(req.query, 2048), packageId = report ? text(req.query, 'packageId') : String(req.params.packageId);
  const requestedSchool = text(req.query, 'schoolNpsn');
  let school = schoolPath || requestedSchool;
  if (schoolPath && requestedSchool && schoolPath !== requestedSchool) throw new QueryError(400, 'Filter sekolah tidak sesuai dengan alamat laporan.');
  if (req.user!.role === 'operator') {
    if (!req.user!.schoolNpsn || (school && school !== req.user!.schoolNpsn)) throw new QueryError(403, 'Sekolah tidak sesuai dengan akun operator.');
    school = req.user!.schoolNpsn;
  }
  const search = text(req.query, 'search'), className = text(req.query, 'className'), status = text(req.query, 'status');
  const sort = text(req.query, 'sort') || 'id';
  if (!Object.hasOwn(orders, sort)) throw new QueryError(400, 'Urutan hasil tidak valid.');
  if (!['', 'selesai', 'sedang_mengerjakan', 'belum_mulai', 'lainnya'].includes(status)) throw new QueryError(400, 'Status hasil tidak valid.');
  const order = orders[sort as keyof typeof orders];
  const scope = createHash('sha256').update(JSON.stringify({ report, packageId, school, search, className, status, sort })).digest('hex').slice(0, 24);
  let after = '';
  if (p.after) {
    try {
      const cursor = JSON.parse(Buffer.from(p.after, 'base64url').toString('utf8'));
      if (cursor.v !== 1 || cursor.scope !== scope || typeof cursor.id !== 'string' || !cursor.id || cursor.id.length > 500) throw new Error();
      after = cursor.id;
    } catch { throw new QueryError(400, 'Cursor tidak sesuai filter atau urutan laporan.'); }
  }
  const clauses: Prisma.Sql[] = [Prisma.sql`u.role = 'siswa'`];
  if (packageId) clauses.push(Prisma.sql`pk.id = ${packageId}`);
  if (report === 'history') clauses.push(Prisma.sql`es.status = 'selesai'`);
  if (school === 'UNKNOWN') clauses.push(Prisma.sql`u."schoolNpsn" IS NULL`);
  else if (school) clauses.push(Prisma.sql`u."schoolNpsn" = ${school}`);
  if (className) clauses.push(Prisma.sql`u."className" = ${className}`);
  if (search) {
    const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
    clauses.push(Prisma.sql`(u."fullName" ILIKE ${pattern} OR u.username ILIKE ${pattern} OR u.nisn ILIKE ${pattern} OR u."className" ILIKE ${pattern} OR pk.name ILIKE ${pattern})`);
  }
  if (status === 'belum_mulai') clauses.push(Prisma.sql`es.id IS NULL`);
  else if (status === 'lainnya') clauses.push(Prisma.sql`es.id IS NOT NULL AND es.status NOT IN ('selesai', 'sedang_mengerjakan')`);
  else if (status) clauses.push(Prisma.sql`es.status = ${status}`);

  // Resolve the anchor inside the same filtered snapshot. No offset-based export
  // and no assumption that a student ID alone defines the score/name ordering.
  let following = Prisma.sql`true`;
  if (after) {
    if (sort === 'id') following = Prisma.sql`f.id > ${after}`;
    else if (sort === 'name_asc' || sort === 'name_desc') {
      const comparison = sort === 'name_asc'
        ? Prisma.sql`f."studentName" > (SELECT "studentName" FROM anchor)`
        : Prisma.sql`f."studentName" < (SELECT "studentName" FROM anchor)`;
      following = Prisma.sql`(${comparison} OR (f."studentName" = (SELECT "studentName" FROM anchor) AND f.id > ${after}))`;
    } else {
      const comparison = sort === 'score_asc'
        ? Prisma.sql`f.score > (SELECT score FROM anchor)` : Prisma.sql`f.score < (SELECT score FROM anchor)`;
      following = Prisma.sql`(${comparison} OR (f.score = (SELECT score FROM anchor) AND f.id > ${after})
        OR (f.score IS NULL AND ((SELECT score FROM anchor) IS NOT NULL OR f.id > ${after})))`;
    }
  }
  const rows = await prisma.$queryRaw<StudentRow[]>`
    WITH filtered AS (
      SELECT ${report ? Prisma.sql`json_build_array(pk.id, u.id)::text` : Prisma.sql`u.id`} AS id,
        u.id AS "studentId", pk.id AS "packageId", pk.name AS "packageName", pk.mapel, u."fullName" AS "studentName", u.nisn, u."schoolNpsn" AS npsn, s.name AS school, u."className",
        es.id AS "sessionId", es.status AS "sessionStatus", es."startTime",
        CASE WHEN es.status = 'selesai' THEN es."endTime" ELSE NULL END AS "endTime",
        CASE WHEN es.status = 'selesai' THEN es."totalScore" ELSE NULL END AS score
      FROM "User" u CROSS JOIN "Package" pk LEFT JOIN "School" s ON s.npsn = u."schoolNpsn"
      LEFT JOIN "ExamSession" es ON es."studentId" = u.id AND es."packageId" = pk.id
      WHERE ${Prisma.join(clauses, ' AND ')}
    ), anchor AS (SELECT * FROM filtered WHERE id = ${after}), paged AS (
      SELECT * FROM filtered f WHERE ${following} ORDER BY ${order.inner} LIMIT ${p.take} OFFSET ${p.skip}
    )
    SELECT p.*, totals.total, ${after ? Prisma.sql`EXISTS (SELECT 1 FROM anchor)` : Prisma.sql`true`} AS "cursorExists"
    FROM (SELECT COUNT(*)::int AS total FROM filtered) totals LEFT JOIN paged p ON true ORDER BY ${order.outer}`;
  if (after && !rows[0]?.cursorExists) throw new QueryError(409, 'Data penanda halaman berubah. Muat ulang daftar atau ulangi ekspor.');
  const total = rows[0]?.total || 0;
  const actual = rows.filter((row): row is StudentRow & { id: string } => row.id !== null);
  const shown = actual.slice(0, p.pageSize);
  const ids = shown.filter(row => row.sessionStatus === 'selesai').map(row => row.sessionId!);
  const breakdown = ids.length ? await prisma.$queryRaw<{ sessionId: string; element: string; total: number; correct: number }[]>`
    SELECT es.id AS "sessionId", q.element, COUNT(*)::int AS total, COUNT(a.id) FILTER (WHERE a."isCorrect" = true)::int AS correct
    FROM "ExamSession" es JOIN "PackageQuestion" pq ON pq."packageId" = es."packageId"
    JOIN "Question" q ON q.id = pq."questionId"
    LEFT JOIN "Answer" a ON a."sessionId" = es.id AND a."questionId" = q.id
    WHERE es.id IN (${Prisma.join(ids)}) AND es.status = 'selesai' GROUP BY es.id, q.element` : [];
  const bySession = new Map<string, Record<string, { total: number; correct: number }>>();
  for (const item of breakdown) {
    const value = bySession.get(item.sessionId) || {};
    value[item.element] = { total: item.total, correct: item.correct }; bySession.set(item.sessionId, value);
  }
  const items = shown.map(row => ({ id: row.id, ...(report ? { studentId: row.studentId, packageId: row.packageId, packageName: row.packageName, mapel: row.mapel } : {}), sessionId: row.sessionId, studentName: row.studentName, nisn: row.nisn,
    npsn: row.npsn || '-', school: row.school || '-', className: row.className, score: row.score, startTime: row.startTime, endTime: row.endTime,
    status: row.sessionStatus === 'selesai' ? 'Selesai' : !row.sessionId ? 'Belum Mulai' : row.sessionStatus === 'sedang_mengerjakan' ? 'Sedang Mengerjakan' : 'Status Lain',
    elementBreakdown: row.sessionStatus === 'selesai' ? bySession.get(row.sessionId!) || {} : {} }));
  const hasMore = actual.length > p.pageSize;
  const last = shown[shown.length - 1];
  return { items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.max(1, Math.ceil(total / p.pageSize)), hasMore,
    nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ v: 1, scope, id: last.id })).toString('base64url') : null };
}
