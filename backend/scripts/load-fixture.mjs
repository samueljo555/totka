import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { writeFile } from 'node:fs/promises';

export async function seedLoadFixture(pool, students = 10050, questions = 50) {
  const password = crypto.randomBytes(8).toString('hex');
  const hash = await bcrypt.hash(password, 10);
  await pool.query('INSERT INTO "School" (npsn,name) VALUES ($1,$2)', ['99999999','Isolated load-test school']);
  await pool.query(`INSERT INTO "User" (id,username,password,"fullName",role,"schoolNpsn","className")
    SELECT 's' || n, 'load_' || n, $1, 'Load student ' || n, 'siswa','99999999','LoadTest'
    FROM generate_series(1,$2::int) n`, [hash, students]);
  await pool.query(`INSERT INTO "Question" (id,type,mapel,element,content,options,"correctAnswer")
    SELECT 'q' || lpad(n::text,3,'0'), CASE n % 3 WHEN 0 THEN 'Pilihan Ganda Sederhana' WHEN 1 THEN 'Pilihan Ganda Kompleks' ELSE 'Pilihan Ganda Kompleks Kategori' END,
      'Matematika','Bilangan', 'Soal load ' || n || repeat(' materi latihan', 40),
      '[{"text":"A"},{"text":"B"},{"text":"C"},{"text":"D"}]'::jsonb,
      CASE WHEN n % 3=2 THEN '[0,0,0,0]'::jsonb ELSE '[0]'::jsonb END
    FROM generate_series(1,$1::int) n`, [questions]);
  await pool.query(`INSERT INTO "Package" (id,name,mapel,status) VALUES ('history','Historical fixture','Matematika','selesai');
    INSERT INTO "PackageQuestion" ("packageId","questionId") SELECT 'history',id FROM "Question";
    INSERT INTO "ExamSession" (id,"studentId","packageId",status,"totalScore","endTime") SELECT 'history-' || id,id,'history','selesai',100,now() FROM "User";
    INSERT INTO "Answer" (id,"sessionId","questionId","answerData",version,"mutationId","isCorrect")
    SELECT es.id || '-' || q.id,es.id,q.id,CASE q.type WHEN 'Pilihan Ganda Sederhana' THEN '0'::jsonb WHEN 'Pilihan Ganda Kompleks' THEN '[0]'::jsonb ELSE '[0,0,0,0]'::jsonb END,1,'history-mutation-' || es.id || q.id,true
    FROM "ExamSession" es CROSS JOIN "Question" q;
    ANALYZE`);
  return { password, students, questions, historicalAnswers: students * questions, bcryptCost: 10 };
}
export async function prepareLoadStage(pool, fixture, id, secret, credentialFile) {
  const examToken = `LOAD_${id}`;
  await pool.query('INSERT INTO "Package" (id,token,name,mapel,status,"durationMinutes") VALUES ($1,$2,$1,\'Matematika\',\'aktif\',90)', [id, examToken]);
  await pool.query('INSERT INTO "PackageQuestion" ("packageId","questionId") SELECT $1,id FROM "Question"', [id]);
  const sid = crypto.randomUUID();
  await pool.query('UPDATE "User" SET "activeToken"=$1', [sid]);
  const credentials = Array.from({ length: fixture.students }, (_, i) => ({ id: `s${i + 1}`, username: `load_${i + 1}`, password: fixture.password, token: jwt.sign({ id: `s${i + 1}`, sid }, secret, { expiresIn: '1h' }) }));
  await writeFile(credentialFile, JSON.stringify(credentials), { mode: 0o600 });
  return examToken;
}
export async function auditLoadStage(pool, packageId, questions, rounds, profile, vus, completed) {
  const counts = (await pool.query(`SELECT count(*)::int AS sessions, count(*) FILTER (WHERE status='selesai')::int AS finished,
    count(*) FILTER (WHERE status='sedang_mengerjakan')::int AS active FROM "ExamSession" WHERE "packageId"=$1`, [packageId])).rows[0];
  const bad = (await pool.query(`SELECT count(*)::int AS n FROM "ExamSession" es WHERE es."packageId"=$1 AND es.status='selesai' AND (
    es."totalScore" IS DISTINCT FROM 100 OR
    (SELECT count(*) FROM "Answer" a WHERE a."sessionId"=es.id) <> $2 OR
    EXISTS (SELECT 1 FROM "Answer" a JOIN "Question" q ON q.id=a."questionId" WHERE a."sessionId"=es.id AND
      (a.version <> $3 OR a."isCorrect" IS DISTINCT FROM true OR a."answerData" IS DISTINCT FROM CASE q.type WHEN 'Pilihan Ganda Sederhana' THEN '0'::jsonb WHEN 'Pilihan Ganda Kompleks' THEN '[0]'::jsonb ELSE '[0,0,0,0]'::jsonb END OR
       NOT EXISTS (SELECT 1 FROM "PackageQuestion" pq WHERE pq."packageId"=es."packageId" AND pq."questionId"=a."questionId"))))`, [packageId, questions, rounds])).rows[0].n;
  const answers = (await pool.query('SELECT count(*)::int AS n FROM "Answer" a JOIN "ExamSession" es ON es.id=a."sessionId" WHERE es."packageId"=$1', [packageId])).rows[0].n;
  return { ...counts, answers, invalidFinishedSessions: bad, passed: bad === 0 && (profile === 'login' ? counts.sessions === 0 : counts.finished === completed && counts.sessions <= vus), allParticipantsFinished: profile === 'login' ? completed === vus : counts.finished === vus && counts.active === 0 };
}
