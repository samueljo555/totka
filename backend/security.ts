import type { PrismaClient } from '@prisma/client';
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

export const validRoles = ['super_admin', 'admin', 'guru', 'operator', 'siswa'] as const;
export type Role = typeof validRoles[number];
export interface Principal {
  id: string;
  role: Role;
  schoolNpsn: string | null;
}

declare global {
  namespace Express {
    interface Request { user?: Principal }
  }
}

export const isAdmin = (role: string) => role === 'super_admin' || role === 'admin';

// Allowlist: newly added sensitive model fields cannot accidentally enter API responses.
export const safeUserSelect = {
  id: true, username: true, fullName: true, role: true, nisn: true,
  className: true, schoolNpsn: true, createdAt: true, school: true,
} as const;

export const studentQuestionSelect = {
  id: true, type: true, mapel: true, element: true, content: true,
  imageUrl: true, options: true,
  reading: { select: { id: true, title: true, content: true } },
} as const;

const admins: Role[] = ['super_admin', 'admin'];
const authors: Role[] = [...admins, 'guru'];
const operators: Role[] = [...admins, 'operator'];
const rules: [string, RegExp, Role[]][] = [
  ['GET', /^\/auth\/session-check\/?$/, [...validRoles]],
  ['GET', /^\/packages\/?$/, operators],
  ['POST', /^\/packages\/?$/, admins],
  ['PUT', /^\/packages\/[^/]+\/?$/, admins],
  ['GET', /^\/overview\/?$/, admins],
  ['GET', /^\/monitoring\/packages(?:\/[^/]+\/students)?\/?$/, operators],
  ['GET', /^\/users\/classes\/?$/, operators],
  ['GET', /^\/users\/?$/, operators],
  ['GET', /^\/users\/login-cards\/?$/, operators],
  ['GET', /^\/users\/[^/]+\/login-card\/?$/, operators],
  ['POST', /^\/users\/[^/]+\/login-card\/reset\/?$/, operators],
  ['POST', /^\/users\/?$/, admins],
  ['PUT', /^\/users\/[^/]+\/?$/, admins],
  ['DELETE', /^\/users\/[^/]+\/?$/, admins],
  ['POST', /^\/users\/siswa(?:\/batch)?\/?$/, operators],
  ['GET', /^\/schools\/?$/, admins],
  ['POST', /^\/schools(?:\/batch)?\/?$/, admins],
  ['PUT', /^\/schools\/[^/]+\/?$/, admins],
  ['DELETE', /^\/schools\/[^/]+\/?$/, admins],
  ['GET', /^\/(?:questions|readings)\/?$/, authors],
  ['POST', /^\/(?:questions|readings)\/?$/, authors],
  ['PUT', /^\/(?:questions|readings)\/[^/]+\/?$/, authors],
  ['DELETE', /^\/(?:questions|readings)\/[^/]+\/?$/, authors],
  ['POST', /^\/upload\/?$/, authors],
  ['GET', /^\/sessions\/?$/, operators],
  ['POST', /^\/sessions\/start\/?$/, ['siswa']],
  ['POST', /^\/sessions\/[^/]+\/(?:answer|finish)\/?$/, ['siswa']],
  ['GET', /^\/analytics\/packages(?:\/[^/]+(?:\/(?:all-students|items|schools\/[^/]+))?)?\/?$/, admins],
  ['GET', /^\/analytics\/(?!packages(?:\/|$))[^/]+\/?$/, operators],
];

/** Authenticate every protected API and deny unlisted routes by default. */
export function authorizeApi(prisma: PrismaClient, secret: string): RequestHandler {
  return async (req, res, next) => {
    if ((req.method === 'POST' && /^\/login\/?$/.test(req.path)) ||
        (req.method === 'GET' && /^\/(?:health|ready)\/?$/.test(req.path))) return next();
    const match = /^Bearer ([^ ]+)$/.exec(req.headers.authorization || '');
    if (!match) return void res.status(401).json({ error: 'UNAUTHORIZED' });

    let payload: jwt.JwtPayload;
    try {
      const decoded = jwt.verify(match[1]!, secret, { algorithms: ['HS256'] });
      if (typeof decoded === 'string' || typeof decoded.id !== 'string' || typeof decoded.sid !== 'string') {
        return void res.status(401).json({ error: 'UNAUTHORIZED', message: 'Silakan login kembali.' });
      }
      payload = decoded;
    } catch (error) {
      return void res.status(401).json({
        error: error instanceof jwt.TokenExpiredError ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED',
        message: 'Token tidak valid atau kedaluwarsa. Silakan login kembali.',
      });
    }

    try {
      // Current DB identity prevents deleted users, changed roles/schools and old logins
      // retaining privileges until the JWT expires. Never trust client role or IDs.
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, role: true, schoolNpsn: true, activeToken: true },
      });
      if (!user || !validRoles.includes(user.role as Role)) {
        return void res.status(401).json({ error: 'UNAUTHORIZED' });
      }
      if (!user.activeToken || user.activeToken !== payload.sid) {
        return void res.status(401).json({ error: 'SESSION_KICKED', message: 'Sesi dinonaktifkan. Silakan login kembali.' });
      }
      req.user = { id: user.id, role: user.role as Role, schoolNpsn: user.schoolNpsn };
      const allowed = rules.some(([method, path, roles]) =>
        req.method === method && path.test(req.path) && roles.includes(req.user!.role));
      if (!allowed || (user.role === 'operator' && !user.schoolNpsn)) {
        return void res.status(403).json({ error: 'FORBIDDEN', message: 'Anda tidak memiliki akses ke data ini.' });
      }

      if (user.role === 'siswa') {
        const suppliedIds = [req.body?.studentId, req.headers['x-student-id'], req.query.studentId];
        if (suppliedIds.some(id => id !== undefined && id !== user.id)) {
          return void res.status(403).json({ error: 'FORBIDDEN' });
        }
        const sessionRoute = /^\/sessions\/([^/]+)\/(?:answer|finish)\/?$/.exec(req.path);
        if (sessionRoute) {
          const session = await prisma.examSession.findUnique({
            where: { id: decodeURIComponent(sessionRoute[1]!) }, select: { studentId: true },
          });
          if (!session || session.studentId !== user.id) {
            return void res.status(403).json({ error: 'FORBIDDEN' });
          }
        }
      }

      // Teachers can edit only their own bank, including referenced reading texts.
      if (user.role === 'guru') {
        const resourceRoute = /^\/(questions|readings)\/([^/]+)\/?$/.exec(req.path);
        if (resourceRoute && ['PUT', 'DELETE'].includes(req.method)) {
          const where = { id: decodeURIComponent(resourceRoute[2]!) };
          const resource = resourceRoute[1] === 'questions'
            ? await prisma.question.findUnique({ where, select: { authorId: true } })
            : await prisma.readingText.findUnique({ where, select: { authorId: true } });
          if (!resource || resource.authorId !== user.id) {
            return void res.status(403).json({ error: 'FORBIDDEN' });
          }
        }
        if (/^\/questions(?:\/|$)/.test(req.path) && req.body?.readingId) {
          const reading = await prisma.readingText.findUnique({
            where: { id: req.body.readingId }, select: { authorId: true },
          });
          if (!reading || reading.authorId !== user.id) {
            return void res.status(403).json({ error: 'FORBIDDEN' });
          }
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
