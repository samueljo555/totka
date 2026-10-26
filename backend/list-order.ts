import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { pagination, QueryError, text } from './pagination.js';

// Preserve ID cursors for existing callers; named sorting uses filter-scoped anchors.
export async function listOrder(req: Request, model: { findFirst: (args: any) => Promise<any> }, where: unknown, nameField: string, idField = 'id') {
  const p = pagination(req.query, 2048), sort = text(req.query, 'sort') || 'id';
  if (!['id', 'name_asc', 'name_desc'].includes(sort)) throw new QueryError(400, 'Urutan data tidak valid.');
  const scope = createHash('sha256').update(JSON.stringify([req.path, where, sort])).digest('hex').slice(0, 24);
  let id = p.after;
  if (p.after && sort !== 'id') {
    try { const decoded = JSON.parse(Buffer.from(p.after, 'base64url').toString('utf8'));if (decoded.scope !== scope || typeof decoded.id !== 'string' || !decoded.id || decoded.id.length > 200) throw new Error();id = decoded.id; }
    catch { throw new QueryError(400, 'Cursor tidak sesuai filter atau urutan data.'); }
  }
  let following: any = id ? { [idField]: { gt: id } } : {};
  if (id && sort !== 'id' && nameField !== idField) {
    const anchor = await model.findFirst({ where: { AND: [where, { [idField]: id }] }, select: { [nameField]: true, [idField]: true } });
    if (!anchor) throw new QueryError(409, 'Data penanda halaman berubah. Muat ulang daftar atau ulangi ekspor.');
    following = { OR: [{ [nameField]: { [sort === 'name_asc' ? 'gt' : 'lt']: anchor[nameField] } }, { [nameField]: anchor[nameField], [idField]: { gt: id } }] };
  } else if (id && sort === 'name_desc' && nameField === idField) following = { [idField]: { lt: id } };
  return { p, sort, following, orderBy: sort === 'id' ? [{ [idField]: 'asc' }] : nameField === idField ? [{ [idField]: sort === 'name_asc' ? 'asc' : 'desc' }] : [{ [nameField]: sort === 'name_asc' ? 'asc' : 'desc' }, { [idField]: 'asc' }],
    cursor: (row: any) => sort === 'id' ? row[idField] : Buffer.from(JSON.stringify({ scope, id: row[idField] })).toString('base64url') };
}
