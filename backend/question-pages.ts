import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { literalSearch, reportPage } from './report-pages.js';
import { isAdmin } from './security.js';
import { visibleContent } from './content-sql.js';
import { text, pagination, pageResult, QueryError } from './pagination.js';

/** Sort/search the visible text, rather than serialized formatting metadata. */
export async function visibleQuestionPage(prisma: PrismaClient, req: Request) {
  const search = text(req.query, 'search'), mapel = text(req.query, 'mapel'), type = text(req.query, 'type');
  const visible = visibleContent(Prisma.sql`q.content`);
  const clauses = [Prisma.sql`true`];
  if (!isAdmin(req.user!.role)) clauses.push(Prisma.sql`q."authorId" = ${req.user!.id}`);
  if (mapel) clauses.push(Prisma.sql`q.mapel = ${mapel}`);
  if (type) clauses.push(Prisma.sql`q.type = ${type}`);
  if (search) clauses.push(Prisma.sql`${visible} ILIKE ${literalSearch(search)}`);
  const sort = text(req.query, 'sort') || 'id';
  if (!['id', 'name_asc', 'name_desc'].includes(sort)) throw new QueryError(400, 'Urutan data tidak valid.');
  const source = Prisma.sql`SELECT q.id, ${visible} AS name, NULL::float8 AS score FROM "Question" q WHERE ${Prisma.join(clauses, ' AND ')}`;
  let page;
  if (sort === 'id') {
    const p = pagination(req.query);
    const rows = await prisma.$queryRaw<{ id: string | null; total: number }[]>`WITH filtered AS (${source}), paged AS (
      SELECT id FROM filtered ${p.after ? Prisma.sql`WHERE id > ${p.after}` : Prisma.empty} ORDER BY id LIMIT ${p.take} OFFSET ${p.skip}
    ) SELECT paged.id, totals.total FROM (SELECT COUNT(*)::int AS total FROM filtered) totals LEFT JOIN paged ON true ORDER BY paged.id`;
    page = pageResult(rows.flatMap(row => row.id ? [{ id: row.id }] : []), rows[0]?.total || 0, p, row => row.id);
  } else page = await reportPage(prisma, req, source, JSON.stringify(['questions', req.user!.id, req.user!.role, mapel, type]));
  const ids = page.items.map(row => String(row.id));
  const records = ids.length ? await prisma.question.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(records.map(row => [row.id, row]));
  return { ...page, items: ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []) };
}
