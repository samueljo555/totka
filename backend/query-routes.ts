import type { Express, Request } from 'express';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { getOrSetCache } from './cache.js';
import { isAdmin, safeUserSelect } from './security.js';
import { pagination, pageResult, afterId, text, studentWhere, QueryError } from './pagination.js';

export function registerQueryRoutes(app: Express, prisma: PrismaClient) {
  const get = (path: string, action: (req: Request) => Promise<unknown>) => app.get(path, async (req, res) => {
    try { res.json(await action(req)); }
    catch (error) {
      if (error instanceof QueryError) return void res.status(error.status).json({ error: 'INVALID_QUERY', message: error.message });
      console.error('Data query failed:', error instanceof Error ? error.name : 'unknown');
      res.status(500).json({ error: 'QUERY_FAILED', message: 'Gagal memuat data.' });
    }
  });
  get('/api/overview', async () => {
    const data = await getOrSetCache('overview', 15, async () => {
      const [roles, packages] = await Promise.all([prisma.user.groupBy({ by: ['role'], _count: { _all: true } }), prisma.package.count()]);
      return { totalUsers: roles.reduce((n, role) => n + role._count._all, 0), students: roles.find(r => r.role === 'siswa')?._count._all || 0, teachers: roles.find(r => r.role === 'guru')?._count._all || 0, packages };
    }, ['api:users', 'v2:api:packages']);
    return data;
  });
  get('/api/users', async req => {
    const p = pagination(req.query), search = text(req.query, 'search'), role = text(req.query, 'role');
    const scoped = studentWhere(req);
    const where: Prisma.UserWhereInput = req.user!.role === 'operator' ? scoped : {
      ...(role ? { role } : {}), ...(text(req.query, 'className') ? { className: text(req.query, 'className') } : {}), ...(text(req.query, 'schoolNpsn') ? { schoolNpsn: text(req.query, 'schoolNpsn') } : {}),
      ...(search ? { OR: ['fullName', 'username', 'nisn'].map(field => ({ [field]: { contains: search, mode: 'insensitive' } })) } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({ where: { AND: [where, afterId(p.after)] }, select: safeUserSelect, orderBy: { id: 'asc' }, skip: p.skip, take: p.take }), prisma.user.count({ where }),
    ]);
    return pageResult(rows, total, p, row => row.id);
  });
  get('/api/users/classes', async req => {
    const where = studentWhere(req);
    delete where.className; delete where.OR;
    const rows = await prisma.user.groupBy({ by: ['className'], where, orderBy: { className: 'asc' } });
    return rows.map(row => row.className).filter((value): value is string => !!value);
  });
  get('/api/schools', async req => {
    const p = pagination(req.query), search = text(req.query, 'search');
    const where: Prisma.SchoolWhereInput = search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { npsn: { contains: search } }] } : {};
    return getOrSetCache(`schools:${JSON.stringify({ p, search })}`, 30, async () => {
      const [rows, total] = await Promise.all([
        prisma.school.findMany({ where: { AND: [where, afterId(p.after, 'npsn')] }, include: { _count: { select: { users: true } } }, orderBy: { npsn: 'asc' }, skip: p.skip, take: p.take }), prisma.school.count({ where }),
      ]);
      return pageResult(rows, total, p, row => row.npsn);
    }, ['api:schools', 'api:users']);
  });
  get('/api/packages', async req => {
    const p = pagination(req.query), search = text(req.query, 'search'), status = text(req.query, 'status');
    const where: Prisma.PackageWhereInput = { ...(status ? { status } : {}), ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}) };
    return getOrSetCache(`packages:${JSON.stringify({ p, search, status, admin: isAdmin(req.user!.role) })}`, 15, async () => {
      const [rows, total] = await Promise.all([
        prisma.package.findMany({ where: { AND: [where, afterId(p.after)] }, include: { _count: { select: { questions: true } }, ...(isAdmin(req.user!.role) ? { questions: true } : {}) }, orderBy: { id: 'asc' }, skip: p.skip, take: p.take }), prisma.package.count({ where }),
      ]);
      return pageResult(rows.map(pkg => ({ ...pkg, token: isAdmin(req.user!.role) || pkg.status === 'aktif' ? pkg.token : null })), total, p, row => row.id);
    }, ['v2:api:packages']);
  });
  get('/api/questions', async req => {
    const p = pagination(req.query), search = text(req.query, 'search'), mapel = text(req.query, 'mapel'), type = text(req.query, 'type');
    const where: Prisma.QuestionWhereInput = { ...(isAdmin(req.user!.role) ? {} : { authorId: req.user!.id }), ...(mapel ? { mapel } : {}), ...(type ? { type } : {}), ...(search ? { content: { contains: search, mode: 'insensitive' } } : {}) };
    return getOrSetCache(`questions:${JSON.stringify({ p, where })}`, 30, async () => {
      const [rows, total] = await Promise.all([
        prisma.question.findMany({ where: { AND: [where, afterId(p.after)] }, orderBy: { id: 'asc' }, skip: p.skip, take: p.take }), prisma.question.count({ where }),
      ]);
      return pageResult(rows, total, p, row => row.id);
    }, ['v2:api:questions:all', `v2:api:questions:${req.user!.id}`]);
  });
  get('/api/readings', async req => {
    const p = pagination(req.query), search = text(req.query, 'search');
    const where: Prisma.ReadingTextWhereInput = { ...(isAdmin(req.user!.role) ? {} : { authorId: req.user!.id }), ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}) };
    return getOrSetCache(`readings:${JSON.stringify({ p, where })}`, 30, async () => {
      const [rows, total] = await Promise.all([
        prisma.readingText.findMany({ where: { AND: [where, afterId(p.after)] }, include: { _count: { select: { questions: true } } }, orderBy: { id: 'asc' }, skip: p.skip, take: p.take }), prisma.readingText.count({ where }),
      ]);
      return pageResult(rows, total, p, row => row.id);
    }, ['v2:api:readings:all', `v2:api:readings:${req.user!.id}`]);
  });
  get('/api/sessions', async req => {
    const p = pagination(req.query), where: Prisma.ExamSessionWhereInput = {
      student: studentWhere(req), ...(text(req.query, 'packageId') ? { packageId: text(req.query, 'packageId') } : {}), ...(text(req.query, 'status') ? { status: text(req.query, 'status') } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.examSession.findMany({ where: { AND: [where, afterId(p.after)] }, include: { student: { select: safeUserSelect }, package: true }, orderBy: { id: 'asc' }, skip: p.skip, take: p.take }), prisma.examSession.count({ where }),
    ]);
    return pageResult(rows.map(row => { const { token: _token, ...pkg } = row.package; return { ...row, package: isAdmin(req.user!.role) ? row.package : pkg }; }), total, p, row => row.id);
  });
  get('/api/analytics/packages', async req => {
    const p = pagination(req.query), search = text(req.query, 'search');
    const where = { examSessions: { some: { status: 'selesai' } }, ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}) };
    return getOrSetCache(`analytics:packages:${JSON.stringify({ p, search })}`, 15, async () => {
      const [rows, total] = await Promise.all([
        prisma.package.findMany({ where: { AND: [where, afterId(p.after)] }, select: { id: true, name: true, mapel: true }, orderBy: { id: 'asc' }, skip: p.skip, take: p.take }), prisma.package.count({ where }),
      ]);
      return pageResult(rows, total, p, row => row.id);
    }, ['analytics:packages', 'v2:api:packages']);
  });
  get('/api/analytics/packages/:packageId', async req => {
    const packageId = String(req.params.packageId);
    return getOrSetCache(`analytics:summary:${packageId}`, 15, async () => {
      const groups = await prisma.$queryRaw<{ npsn: string; name: string; registered: number; finished: number; average: number | null; highest: number | null; lowest: number | null }[]>`
        SELECT COALESCE(u."schoolNpsn", 'UNKNOWN') AS npsn, COALESCE(s.name, 'Tanpa Sekolah') AS name,
          COUNT(*)::int AS registered, COUNT(es.id) FILTER (WHERE es.status = 'selesai')::int AS finished,
          AVG(es."totalScore") FILTER (WHERE es.status = 'selesai')::float8 AS average,
          MAX(es."totalScore") FILTER (WHERE es.status = 'selesai')::float8 AS highest,
          MIN(es."totalScore") FILTER (WHERE es.status = 'selesai')::float8 AS lowest
        FROM "User" u LEFT JOIN "School" s ON s.npsn = u."schoolNpsn"
        LEFT JOIN "ExamSession" es ON es."studentId" = u.id AND es."packageId" = ${packageId}
        WHERE u.role = 'siswa' GROUP BY u."schoolNpsn", s.name ORDER BY npsn`;
      const completed = groups.reduce((n, row) => n + row.finished, 0);
      const finishedGroups = groups.filter(row => row.finished);
      return {
        summary: groups.length ? { average: completed ? groups.reduce((n, row) => n + (row.average || 0) * row.finished, 0) / completed : 0, highest: finishedGroups.length ? Math.max(...finishedGroups.map(r => r.highest || 0)) : 0, lowest: finishedGroups.length ? Math.min(...finishedGroups.map(r => r.lowest || 0)) : 0, totalParticipants: completed, registeredStudents: groups.reduce((n, row) => n + row.registered, 0) } : null,
        schools: groups.map(row => ({ npsn: row.npsn, name: row.name, participantCount: row.finished, registeredCount: row.registered, averageScore: row.average || 0 })),
      };
    }, [`analytics:pkg:${packageId}`, 'api:users', 'api:schools']);
  });

  const students = async (req: Request, schoolNpsn?: string) => {
    const p = pagination(req.query), packageId = String(req.params.packageId);
    const where: Prisma.UserWhereInput = { ...studentWhere(req), ...(schoolNpsn ? { schoolNpsn: schoolNpsn === 'UNKNOWN' ? null : schoolNpsn } : {}) };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({ where: { AND: [where, afterId(p.after)] }, select: { id: true, fullName: true, nisn: true, schoolNpsn: true, className: true, school: { select: { name: true } }, examSessions: { where: { packageId }, select: { id: true, status: true, startTime: true, endTime: true, totalScore: true } } }, orderBy: { id: 'asc' }, skip: p.skip, take: p.take }), prisma.user.count({ where }),
    ]);
    const shown = rows.slice(0, p.pageSize);
    const sessionIds = shown.flatMap(row => row.examSessions.filter(s => s.status === 'selesai').map(s => s.id));
    const breakdown = sessionIds.length ? await prisma.$queryRaw<{ sessionId: string; element: string; total: number; correct: number }[]>`
      SELECT es.id AS "sessionId", q.element, COUNT(*)::int AS total, COUNT(a.id) FILTER (WHERE a."isCorrect" = true)::int AS correct
      FROM "ExamSession" es JOIN "PackageQuestion" pq ON pq."packageId" = es."packageId"
      JOIN "Question" q ON q.id = pq."questionId"
      LEFT JOIN "Answer" a ON a."sessionId" = es.id AND a."questionId" = q.id
      WHERE es.id IN (${Prisma.join(sessionIds)}) AND es.status = 'selesai' GROUP BY es.id, q.element` : [];
    const bySession = new Map<string, Record<string, { total: number; correct: number }>>();
    for (const item of breakdown) { const value = bySession.get(item.sessionId) || {}; value[item.element] = { total: item.total, correct: item.correct }; bySession.set(item.sessionId, value); }
    const mapped = rows.map(row => {
      const session = row.examSessions[0], finished = session?.status === 'selesai';
      return { id: row.id, sessionId: session?.id || null, studentName: row.fullName, nisn: row.nisn, npsn: row.schoolNpsn || '-', school: row.school?.name || '-', className: row.className, score: finished ? session.totalScore : null, startTime: session?.startTime || null, endTime: finished ? session.endTime : null, status: finished ? 'Selesai' : session ? 'Sedang Mengerjakan' : 'Tidak Mengerjakan', elementBreakdown: finished ? bySession.get(session.id) || {} : {} };
    });
    return pageResult(mapped, total, p, row => row.id);
  };
  get('/api/analytics/packages/:packageId/all-students', req => students(req));
  get('/api/analytics/packages/:packageId/schools/:schoolNpsn', req => students(req, String(req.params.schoolNpsn)));
  get('/api/analytics/packages/:packageId/items', async req => {
    const packageId = String(req.params.packageId);
    return getOrSetCache(`analytics:items:${packageId}`, 15, async () => {
      const pkg = await prisma.package.findUnique({ where: { id: packageId }, select: { name: true, questions: { orderBy: { questionId: 'asc' }, select: { questionId: true, question: { select: { content: true } } } } } });
      if (!pkg) throw new QueryError(404, 'Paket tidak ditemukan.');
      const groups = await prisma.answer.groupBy({ by: ['questionId', 'isCorrect'], where: { session: { packageId, status: 'selesai' }, questionId: { in: pkg.questions.map(q => q.questionId) } }, _count: { _all: true } });
      const totals = new Map<string, { total: number; correct: number }>();
      for (const group of groups) { const value = totals.get(group.questionId) || { total: 0, correct: 0 }; value.total += group._count._all; if (group.isCorrect) value.correct += group._count._all; totals.set(group.questionId, value); }
      return { package: pkg.name, items: pkg.questions.map((q, index) => { const counts = totals.get(q.questionId) || { total: 0, correct: 0 }; const difficultyIndex = counts.total ? counts.correct / counts.total : 0; return { questionId: q.questionId, questionNumber: index + 1, content: q.question.content, cognitiveLevel: 'C3', totalAttempts: counts.total, correctCount: counts.correct, difficultyIndex, category: difficultyIndex > 0.7 ? 'Mudah' : difficultyIndex < 0.3 ? 'Sulit' : 'Sedang' }; }) };
    }, [`analytics:pkg:${packageId}`]);
  });

  get('/api/monitoring/packages', async req => {
    const p = pagination(req.query), status = text(req.query, 'status');
    const scope = studentWhere(req); delete scope.OR; delete scope.className;
    const where: Prisma.PackageWhereInput = status === 'history' ? { status: { not: 'aktif' } } : status ? { status } : {};
    const [packages, total, registered] = await Promise.all([
      prisma.package.findMany({ where: { AND: [where, afterId(p.after)] }, select: { id: true, name: true, mapel: true, token: true, status: true }, orderBy: { id: 'asc' }, skip: p.skip, take: p.take }), prisma.package.count({ where }), prisma.user.count({ where: scope }),
    ]);
    const ids = packages.map(pkg => pkg.id);
    const groups = ids.length ? await prisma.examSession.groupBy({ by: ['packageId', 'status'], where: { packageId: { in: ids }, student: scope }, _count: { _all: true }, _avg: { totalScore: true }, _min: { totalScore: true }, _max: { totalScore: true } }) : [];
    return pageResult(packages.map(pkg => {
      const finished = groups.find(g => g.packageId === pkg.id && g.status === 'selesai');
      const started = groups.filter(g => g.packageId === pkg.id).reduce((n, group) => n + group._count._all, 0);
      const ongoing = groups.find(g => g.packageId === pkg.id && g.status === 'sedang_mengerjakan')?._count._all || 0;
      return { ...pkg, token: pkg.status === 'aktif' ? pkg.token : null, registeredStudents: registered, finished: finished?._count._all || 0, ongoing, notStarted: Math.max(0, registered - started), averageScore: Number(finished?._avg.totalScore || 0), highestScore: Number(finished?._max.totalScore || 0), lowestScore: Number(finished?._min.totalScore || 0) };
    }), total, p, row => row.id);
  });
  get('/api/monitoring/packages/:packageId/students', async req => {
    const p = pagination(req.query), packageId = String(req.params.packageId);
    const status = text(req.query, 'status');
    const where: Prisma.UserWhereInput = { ...studentWhere(req), ...(status === 'selesai' || status === 'sedang_mengerjakan' ? { examSessions: { some: { packageId, status } } } : status === 'belum' ? { examSessions: { none: { packageId } } } : {}) };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({ where: { AND: [where, afterId(p.after)] }, select: { id: true, fullName: true, username: true, nisn: true, className: true, schoolNpsn: true, examSessions: { where: { packageId }, select: { id: true, status: true, totalScore: true, startTime: true, endTime: true } } }, orderBy: { id: 'asc' }, skip: p.skip, take: p.take }), prisma.user.count({ where }),
    ]);
    return pageResult(rows.map(row => ({ ...row, session: row.examSessions[0] || null, examSessions: undefined })), total, p, row => row.id);
  });
}
