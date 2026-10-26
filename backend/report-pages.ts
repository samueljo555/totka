import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { pagination, QueryError, text } from './pagination.js';

// Bounded pages and scoped export cursors. Each record belongs to one package.
export async function reportPage(prisma: PrismaClient, req: Request, source: Prisma.Sql, scopeName: string) {
  const p = pagination(req.query, 2048);
  const sort = text(req.query, 'sort') || 'name_asc';
  const orders: Record<string, Prisma.Sql> = {
    name_asc: Prisma.sql`f.name ASC, f.id ASC`, name_desc: Prisma.sql`f.name DESC, f.id ASC`,
    score_asc: Prisma.sql`f.score ASC NULLS LAST, f.id ASC`, score_desc: Prisma.sql`f.score DESC NULLS LAST, f.id ASC`,
  };
  if (!Object.hasOwn(orders, sort)) throw new QueryError(400, 'Urutan laporan tidak valid.');
  const scope = createHash('sha256').update(JSON.stringify([scopeName, ...['packageId', 'schoolNpsn', 'search', 'category', 'sort'].map(key => text(req.query, key))])).digest('hex').slice(0, 24);
  let after = '';
  if (p.after) {
    try {
      const cursor = JSON.parse(Buffer.from(p.after, 'base64url').toString('utf8'));
      if (cursor.scope !== scope || typeof cursor.id !== 'string' || !cursor.id || cursor.id.length > 500) throw new Error();
      after = cursor.id;
    } catch { throw new QueryError(400, 'Cursor tidak sesuai filter atau urutan laporan.'); }
  }
  const rows = await prisma.$queryRaw<{ item: Record<string, unknown> | null; total: number; cursorExists: boolean }[]>`
    WITH filtered AS (${source}), ranked AS (
      SELECT f.*, ROW_NUMBER() OVER (ORDER BY ${orders[sort]!}) AS ordinal FROM filtered f
    ), anchor AS (SELECT ordinal FROM ranked WHERE id = ${after}), paged AS (
      SELECT * FROM ranked WHERE ordinal > ${after ? Prisma.sql`(SELECT ordinal FROM anchor)` : Prisma.sql`0`}
      ORDER BY ordinal LIMIT ${p.take} OFFSET ${p.skip}
    )
    SELECT CASE WHEN p.id IS NULL THEN NULL ELSE to_jsonb(p) - 'ordinal' END AS item, totals.total,
      ${after ? Prisma.sql`EXISTS (SELECT 1 FROM anchor)` : Prisma.sql`true`} AS "cursorExists"
    FROM (SELECT COUNT(*)::int AS total FROM filtered) totals LEFT JOIN paged p ON true ORDER BY p.ordinal`;
  if (after && !rows[0]?.cursorExists) throw new QueryError(409, 'Data penanda halaman berubah. Muat ulang daftar atau ulangi ekspor.');
  const total = rows[0]?.total || 0, actual = rows.flatMap(row => row.item ? [row.item] : []);
  const items = actual.slice(0, p.pageSize), hasMore = actual.length > p.pageSize;
  return { items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.max(1, Math.ceil(total / p.pageSize)), hasMore,
    nextCursor: hasMore ? Buffer.from(JSON.stringify({ scope, id: items.at(-1)!.id })).toString('base64url') : null };
}

export function selectedPackages(req: Request) {
  const id = text(req.query, 'packageId');
  return Prisma.sql`SELECT id, name, mapel FROM "Package" ${id ? Prisma.sql`WHERE id = ${id}` : Prisma.empty}`;
}
export function literalSearch(value: string) { return '%' + value.replace(/[\\%_]/g, '\\$&') + '%'; }

export async function schoolReport(prisma: PrismaClient, req: Request) {
  const school = text(req.query, 'schoolNpsn'), search = text(req.query, 'search');
  const clauses: Prisma.Sql[] = [Prisma.sql`u.role = 'siswa'`];
  if (school === 'UNKNOWN') clauses.push(Prisma.sql`u."schoolNpsn" IS NULL`);
  else if (school) clauses.push(Prisma.sql`u."schoolNpsn" = ${school}`);
  if (search) clauses.push(Prisma.sql`(s.name ILIKE ${literalSearch(search)} OR u."schoolNpsn" ILIKE ${literalSearch(search)} OR pk.name ILIKE ${literalSearch(search)})`);
  return reportPage(prisma, req, Prisma.sql`
    WITH chosen AS (${selectedPackages(req)})
    SELECT json_build_array(pk.id, u."schoolNpsn")::text AS id, pk.id AS "packageId", pk.name AS "packageName", pk.mapel,
      COALESCE(u."schoolNpsn", 'UNKNOWN') AS npsn, COALESCE(s.name, 'Tanpa Sekolah') AS name,
      COUNT(*)::int AS "totalStudents", COUNT(es.id)::int AS "startedCount",
      COUNT(es.id) FILTER (WHERE es.status = 'sedang_mengerjakan')::int AS "ongoingCount",
      COUNT(es.id) FILTER (WHERE es.status = 'selesai')::int AS "finishedCount",
      COUNT(*) FILTER (WHERE es.id IS NULL)::int AS "notStartedCount",
      COUNT(es.id) FILTER (WHERE es.status NOT IN ('sedang_mengerjakan', 'selesai'))::int AS "otherCount",
      AVG(es."totalScore") FILTER (WHERE es.status = 'selesai')::float8 AS score
    FROM "User" u CROSS JOIN chosen pk LEFT JOIN "School" s ON s.npsn = u."schoolNpsn"
    LEFT JOIN "ExamSession" es ON es."studentId" = u.id AND es."packageId" = pk.id
    WHERE ${Prisma.join(clauses, ' AND ')} GROUP BY pk.id, pk.name, pk.mapel, u."schoolNpsn", s.name`, 'schools');
}

export async function itemReport(prisma: PrismaClient, req: Request) {
  const category = text(req.query, 'category'), search = text(req.query, 'search');
  if (!['', 'Mudah', 'Sedang', 'Sulit', 'Belum ada data'].includes(category)) throw new QueryError(400, 'Kategori tidak valid.');
  const clauses = [Prisma.sql`true`];
  if (category) clauses.push(Prisma.sql`r.category = ${category}`);
  if (search) clauses.push(Prisma.sql`(r.name ILIKE ${literalSearch(search)} OR r."packageName" ILIKE ${literalSearch(search)})`);
  return reportPage(prisma, req, Prisma.sql`
    WITH chosen AS (${selectedPackages(req)}), completed AS (
      SELECT es.id, es."packageId" FROM "ExamSession" es JOIN chosen pk ON pk.id = es."packageId" WHERE es.status = 'selesai'
    ), participants AS (SELECT "packageId", COUNT(*)::int AS total FROM completed GROUP BY "packageId"), answer_state AS (
      SELECT es."packageId", a."questionId", a."isCorrect", CASE
        WHEN a."answerData" IS NULL OR a."answerData" IN ('null'::jsonb, '""'::jsonb) THEN false
        WHEN jsonb_typeof(a."answerData") = 'array' THEN EXISTS (SELECT 1 FROM jsonb_array_elements(a."answerData") part(value) WHERE part.value NOT IN ('null'::jsonb, '""'::jsonb))
        ELSE true END AS answered
      FROM "Answer" a JOIN completed es ON es.id = a."sessionId"
      JOIN "PackageQuestion" pq ON pq."packageId" = es."packageId" AND pq."questionId" = a."questionId"
    ), counts AS (
      SELECT "packageId", "questionId", COUNT(*) FILTER (WHERE answered)::int AS answered,
        COUNT(*) FILTER (WHERE answered AND "isCorrect" = true)::int AS correct
      FROM answer_state GROUP BY "packageId", "questionId"
    ), numbered AS (
      SELECT pk.id AS "packageId", pk.name AS "packageName", pk.mapel, q.id AS "questionId", q.content AS name,
        ROW_NUMBER() OVER (PARTITION BY pk.id ORDER BY q.id)::int AS "questionNumber",
        COALESCE(p.total, 0) AS "totalAttempts", COALESCE(c.correct, 0) AS "correctCount",
        COALESCE(c.answered, 0) - COALESCE(c.correct, 0) AS "wrongCount", COALESCE(p.total, 0) - COALESCE(c.answered, 0) AS "emptyCount",
        COALESCE(c.correct, 0)::float8 / NULLIF(p.total, 0) AS score
      FROM chosen pk JOIN "PackageQuestion" pq ON pq."packageId" = pk.id JOIN "Question" q ON q.id = pq."questionId"
      LEFT JOIN participants p ON p."packageId" = pk.id LEFT JOIN counts c ON c."packageId" = pk.id AND c."questionId" = q.id
    ), categorized AS (
      SELECT *, json_build_array("packageId", "questionId")::text AS id,
        CASE WHEN score IS NULL THEN 'Belum ada data' WHEN score > 0.7 THEN 'Mudah' WHEN score < 0.3 THEN 'Sulit' ELSE 'Sedang' END AS category
      FROM numbered
    ) SELECT * FROM categorized r WHERE ${Prisma.join(clauses, ' AND ')}`, 'items');
}
