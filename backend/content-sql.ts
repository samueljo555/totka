import { Prisma } from '@prisma/client';
import { RICH_PREFIX } from './rich-content.js';

// Only call with a SQL expression supplied by application code.
export function visibleContent(column: Prisma.Sql) {
  return Prisma.sql`CASE WHEN LEFT(${column}, ${RICH_PREFIX.length}) = ${RICH_PREFIX}
    THEN COALESCE(SUBSTRING(${column} FROM ${RICH_PREFIX.length + 1}::integer)::jsonb ->> 'text', '') ELSE ${column} END`;
}
