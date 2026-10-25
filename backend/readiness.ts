export function readinessProbe(check: () => Promise<unknown>, timeoutMs = 2000) {
  let pending: Promise<boolean> | undefined;
  let lastAt = 0, lastResult = false;
  return async () => {
    if (Date.now() - lastAt < 1000) return lastResult;
    if (!pending) {
      pending = check().then(() => true, () => false).then(result => {
        lastAt = Date.now(); lastResult = result; pending = undefined; return result;
      });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([pending, new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]);
    } finally { clearTimeout(timer); }
  };
}

import type { PrismaClient } from '@prisma/client';
export function checkDatabase(prisma: PrismaClient) {
  // Parse all tables/operational columns without scanning any student records.
  return prisma.$queryRaw`SELECT a.version, a."mutationId", u.username, u.password,
    u."loginCardPassword", u."activeToken", u."schoolNpsn", s.npsn,
    q."imageUrl", q."readingId", r.id, p.token, es.id, pq."questionId"
    FROM "Answer" a, "User" u, "School" s, "Question" q, "ReadingText" r,
    "Package" p, "ExamSession" es, "PackageQuestion" pq LIMIT 0`;
}
