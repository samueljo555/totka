import { validateContentField, parseRichContent, encodeRichContent, safeImageUrl, contentHasValue, RichContentError } from './rich-content.js';
import { listOrder } from './list-order.js';
import express from 'express';
import cors from 'cors';
import { PrismaClient, type Prisma } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import { readinessProbe, checkDatabase } from './readiness.js';
import { runtimePaths } from './runtime-paths.js';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { registerQueryRoutes } from './query-routes.js';
import { pageResult, studentWhere, QueryError } from './pagination.js';
import { deleteCache } from './cache.js';
import { createLoginCardCipher, studentPassword } from './login-cards.js';
import { authorizeApi, safeUserSelect, studentQuestionSelect, isAdmin, validRoles } from './security.js';

const BCRYPT_ROUNDS = 10;
const JWT_EXPIRES_IN = '8h';


import { ExamError, startExam, saveExamAnswer, finishExam, examTransaction, lockExamContent, assertContentEditable } from './exam.js';

import { Storage } from '@google-cloud/storage';

export function createApp(prisma: PrismaClient, JWT_SECRET: string, cardSecret = process.env.LOGIN_CARD_SECRET || JWT_SECRET, runtime = { isDraining: () => false }) {
  const loginCards = createLoginCardCipher(cardSecret);
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '512kb' }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.use('/api', authorizeApi(prisma, JWT_SECRET));

  const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'LOCAL'; // 'LOCAL' or 'GCP'

  const paths = runtimePaths();
  const uploadDir = paths.uploads;
  if (STORAGE_PROVIDER === 'LOCAL' && !fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  if (STORAGE_PROVIDER === 'LOCAL') fs.accessSync(uploadDir, fs.constants.R_OK | fs.constants.W_OK);

  // Storage for Local
  const diskStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
      cb(null, uniqueSuffix + ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[file.mimetype] || '.bin'))
    }
  });

  // Storage for GCP
  const memoryStorage = multer.memoryStorage();

  const upload = multer({
    storage: STORAGE_PROVIDER === 'GCP' ? memoryStorage : diskStorage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype) ? cb(null, true) : cb(new Error('Gunakan gambar PNG, JPEG, atau WebP.'))
  });

  let gcpStorage: Storage | null = null;
  let bucketName = process.env.GCP_BUCKET_NAME || '';

  if (STORAGE_PROVIDER === 'GCP') {
    const gcpOptions: any = {};
    if (process.env.GCP_PROJECT_ID) gcpOptions.projectId = process.env.GCP_PROJECT_ID;
    if (process.env.GCP_KEY_FILE_PATH) gcpOptions.keyFilename = process.env.GCP_KEY_FILE_PATH;
    gcpStorage = new Storage(gcpOptions);
  }

  app.use('/uploads', express.static(uploadDir));

  app.post('/api/upload', (req, res, next) => { upload.single('image')(req, res, error => error ? res.status(error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: 'UPLOAD_FAILED', message: error instanceof multer.MulterError ? 'Gambar maksimal 5 MB dan satu file per unggahan.' : 'Gunakan gambar PNG, JPEG, atau WebP.' }) : next()); }, (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const bytes = req.file.buffer || fs.readFileSync(req.file.path);
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!(req.file.mimetype === 'image/png' && png || req.file.mimetype === 'image/jpeg' && jpeg || req.file.mimetype === 'image/webp' && webp)) {
      if (req.file.path) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'INVALID_IMAGE', message: 'Isi file bukan gambar PNG, JPEG, atau WebP yang sesuai.' });
    }
    if (STORAGE_PROVIDER === 'GCP' && gcpStorage) {
      const bucket = gcpStorage.bucket(bucketName);
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const blobName = uniqueSuffix + ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[req.file.mimetype] || '.bin');
      const blob = bucket.file(blobName);

      const blobStream = blob.createWriteStream({
        resumable: false,
        contentType: req.file.mimetype
      });

      blobStream.on('error', (err) => {
        console.error("GCP Upload Error:", err);
        return res.status(500).json({ error: 'Failed to upload to GCP' });
      });

      blobStream.on('finish', () => {
        // Return the public URL for the uploaded file
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${blobName}`;
        return res.json({ imageUrl: publicUrl });
      });

      blobStream.end(req.file.buffer);
    } else {
      // Return the local URL
      res.json({ imageUrl: `/uploads/${req.file.filename}` });
    }
  });

  // Basic health check route
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'TKA Backend API is running' });
  });

  // Readiness checks the real database and a required application column.
  // No dependency details or credentials are returned to public callers.
  const ready = readinessProbe(() => checkDatabase(prisma));
  app.get('/api/ready', async (_req, res) => {
    if (runtime.isDraining()) return void res.status(503).json({ status: 'unavailable' });
    const available = await ready();
    res.status(available ? 200 : 503).json({ status: available ? 'ready' : 'unavailable' });
  });

  // Example route: Get all packages


  app.post('/api/packages', async (req, res) => {
    try {
      const { name, mapel, token, durationMinutes, navigationMode, releaseScoreMode, status, questionIds } = req.body;

      // Validate if token is already in use
      const existing = await prisma.package.findFirst({ where: { token } });
      if (existing) {
        return res.status(400).json({ error: 'Token sudah digunakan' });
      }

      const newPackage = await prisma.package.create({
        data: {
          name,
          mapel,
          token,
          durationMinutes,
          navigationMode,
          releaseScoreMode,
          status,
          createdById: req.user!.id
        }
      });

      if (questionIds && questionIds.length > 0) {
        await prisma.packageQuestion.createMany({
          data: questionIds.map((qId: string) => ({
            packageId: newPackage.id,
            questionId: qId
          }))
        });
      }

      await deleteCache('v2:api:packages');
      res.json(newPackage);
    } catch (error) {
      console.error("Create package error:", error);
      res.status(500).json({ error: 'Failed to create package' });
    }
  });

  app.put('/api/packages/:id', async (req, res) => {
    try {
      const { name, mapel, token, durationMinutes, navigationMode, releaseScoreMode, status, questionIds } = req.body;

      // Validate if token is already in use by ANOTHER package
      if (token) {
        const existing = await prisma.package.findFirst({ where: { token } });
        if (existing && existing.id !== req.params.id) {
          return res.status(400).json({ error: 'Token sudah digunakan oleh paket lain' });
        }
      }

      const updatedPackage = await examTransaction(prisma, async tx => {
        await lockExamContent(tx, true);
        const existing = await tx.package.findUnique({ where: { id: req.params.id }, include: { questions: true } });
        if (!existing) throw new ExamError(404, 'PACKAGE_NOT_FOUND', 'Paket tidak ditemukan.');
        const changesContent = Object.entries({ name, mapel, token, durationMinutes, navigationMode })
          .some(([key, value]) => value !== undefined && value !== existing[key as keyof typeof existing]);
        const currentIds = existing.questions.map(item => item.questionId).sort();
        const changesQuestions = questionIds !== undefined &&
          (!Array.isArray(questionIds) || JSON.stringify([...new Set(questionIds)].sort()) !== JSON.stringify(currentIds));
        if (changesContent || changesQuestions) await assertContentEditable(tx, 'package', req.params.id);
        if (durationMinutes !== undefined && (!Number.isInteger(durationMinutes) || durationMinutes <= 0)) {
          throw new ExamError(400, 'INVALID_EXAM_CONFIG', 'Durasi harus berupa bilangan bulat positif.');
        }
        const updated = await tx.package.update({
          where: { id: req.params.id },
          data: {
            ...(name && { name }),
            ...(mapel && { mapel }),
            ...(token && { token }),
            ...(durationMinutes && { durationMinutes }),
            ...(navigationMode && { navigationMode }),
            ...(releaseScoreMode && { releaseScoreMode }),
            ...(status && { status }),
          }
        });

        if (questionIds && changesQuestions) {
          // Delete existing
          await tx.packageQuestion.deleteMany({ where: { packageId: req.params.id } });
          // Create new
          if (questionIds.length > 0) {
            await tx.packageQuestion.createMany({
              data: questionIds.map((qId: string) => ({
                packageId: req.params.id,
                questionId: qId
              }))
            });
          }
        }

        return updated;
      });

      await deleteCache('v2:api:packages');
      res.json(updatedPackage);
    } catch (error) {
      if (error instanceof ExamError) return res.status(error.status).json({ error: error.code, message: error.message });
      console.error("Update package error:", error);
      res.status(500).json({ error: 'Failed to update package' });
    }
  });

  const cardSelect = { ...safeUserSelect, password: true, loginCardPassword: true } as const;
  const cardDto = (user: { id: string; password: string; loginCardPassword: string | null; [key: string]: unknown }) => {
    const { password, loginCardPassword, ...profile } = user;
    let loginPassword: string | null = null;
    if (loginCardPassword) {
      try { loginPassword = loginCards.open(user.id, loginCardPassword); }
      catch { /* The UI offers an explicit reset; never silently change a student's password. */ }
    } else if (!/^\$2[aby]\$/.test(password)) {
      // Existing plaintext accounts remain printable until their next login upgrades them.
      loginPassword = password;
    }
    return { ...profile, loginPassword };
  };
  const cardScope = (req: express.Request) => ({
    role: 'siswa', ...(req.user!.role === 'operator' ? { schoolNpsn: req.user!.schoolNpsn } : {})
  });

  registerQueryRoutes(app, prisma);
  app.get('/api/users/login-cards', async (req, res) => {
    try {
      const where = studentWhere(req);
      const { p, following, orderBy, cursor } = await listOrder(req, prisma.user, where, 'fullName');
      const [users, total] = await Promise.all([
        prisma.user.findMany({ where: { AND: [where, following] }, select: cardSelect, orderBy: orderBy as Prisma.UserOrderByWithRelationInput[], skip: p.skip, take: p.take }),
        prisma.user.count({ where }),
      ]);
      const result = pageResult(users, total, p, cursor);
      res.json({ ...result, items: result.items.map(cardDto) });
    } catch (error) {
      if (error instanceof QueryError) return res.status(error.status).json({ error: 'INVALID_QUERY', message: error.message });
      res.status(500).json({ error: 'LOGIN_CARDS_FAILED', message: 'Gagal memuat kartu login siswa.' });
    }
  });

  app.get('/api/users/:id/login-card', async (req, res) => {
    try {
      const user = await prisma.user.findFirst({ where: { id: req.params.id, ...cardScope(req) }, select: cardSelect });
      if (!user) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(cardDto(user));
    } catch { res.status(500).json({ error: 'LOGIN_CARDS_FAILED' }); }
  });

  app.post('/api/users/:id/login-card/reset', async (req, res) => {
    try {
      const password = studentPassword();
      // School and role are part of the UPDATE predicate as well as the read policy.
      const user = await prisma.user.update({
        where: { id: req.params.id, ...cardScope(req) },
        data: { password: await bcrypt.hash(password, BCRYPT_ROUNDS), loginCardPassword: loginCards.seal(req.params.id, password), activeToken: null },
        select: cardSelect,
      });
      res.json(cardDto(user));
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') return res.status(404).json({ error: 'NOT_FOUND' });
      res.status(500).json({ error: 'RESET_FAILED', message: 'Gagal mengatur ulang password siswa.' });
    }
  });

  app.post('/api/users', async (req, res) => {
    const { username, password, fullName, role, schoolNpsn } = req.body;
    if (!username || !password || !fullName || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Peran tidak valid' });

    try {
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const id = crypto.randomUUID();
      const newUser = await prisma.user.create({
        data: {
          id,
          loginCardPassword: role === 'siswa' ? loginCards.seal(id, password) : null,
          username,
          password: hashedPassword,
          fullName,
          role,
          ...(schoolNpsn && { schoolNpsn })
        },
        select: safeUserSelect
      });

      await deleteCache('api:users');
      res.json({ message: 'User created successfully', user: newUser });
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ error: 'Internal server error while creating user' });
    }
  });

  app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { username, password, fullName, role, schoolNpsn } = req.body;
    if (role !== undefined && !validRoles.includes(role)) return res.status(400).json({ error: 'Peran tidak valid' });

    try {
      const existingUser = await prisma.user.findUnique({ where: { id }, include: { school: true } });
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (username && username !== existingUser.username) {
        const usernameTaken = await prisma.user.findUnique({ where: { username } });
        if (usernameTaken) {
          return res.status(400).json({ error: 'Username already taken' });
        }
      }

      let finalPassword = existingUser.password;
      let passwordChanged = false;
      if (password && password.trim() !== '') {
        const hashed = /^\$2[aby]\$/.test(existingUser.password);
        const same = hashed ? await bcrypt.compare(password, existingUser.password) : password === existingUser.password;
        passwordChanged = !same;
        if (!same || !hashed) finalPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          username: username || existingUser.username,
          password: finalPassword,
          fullName: fullName || existingUser.fullName,
          role: role || existingUser.role,
          loginCardPassword: (role || existingUser.role) !== 'siswa' ? null
            : password && password.trim() !== '' ? loginCards.seal(id, password) : existingUser.loginCardPassword,
          schoolNpsn: schoolNpsn !== undefined ? schoolNpsn || null : existingUser.schoolNpsn,
          ...(passwordChanged ? { activeToken: null } : {})
        },
        select: safeUserSelect
      });

      await deleteCache('api:users');
      res.json({ message: 'User updated successfully', user: updatedUser });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ error: 'Internal server error while updating user' });
    }
  });

  app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await prisma.user.delete({ where: { id } });
      await deleteCache('api:users');
      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // School CRUD


  app.post('/api/schools', async (req, res) => {
    const { npsn, name, region } = req.body;
    if (!npsn || !name) return res.status(400).json({ error: 'NPSN and Name are required' });

    try {
      const school = await prisma.school.create({ data: { npsn, name, region } });

      // Auto-create operator account
      await prisma.user.create({
        data: {
          username: npsn,
          password: await bcrypt.hash(npsn, BCRYPT_ROUNDS),
          fullName: name,
          role: 'operator',
          schoolNpsn: npsn
        }
      }).catch(() => {}); // ignore if user already exists

      await Promise.all([deleteCache('api:schools'), deleteCache('api:users')]);
      res.json({ message: 'School created successfully', school });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create school' });
    }
  });

  app.post('/api/schools/batch', async (req, res) => {
    const { schools } = req.body;
    if (!Array.isArray(schools)) return res.status(400).json({ error: 'Invalid data' });

    try {
      const result = await prisma.school.createMany({
        data: schools,
        skipDuplicates: true
      });

      const operatorUsers = await Promise.all(schools.map(async (s: any) => ({
        username: s.npsn,
        password: await bcrypt.hash(s.npsn, BCRYPT_ROUNDS),
        fullName: s.name,
        role: 'operator',
        schoolNpsn: s.npsn
      })));

      await prisma.user.createMany({
        data: operatorUsers,
        skipDuplicates: true
      });

      await Promise.all([deleteCache('api:schools'), deleteCache('api:users')]);
      res.json({ message: `Successfully imported ${result.count} schools and generated their operator accounts` });
    } catch (error) {
      res.status(500).json({ error: 'Failed to import schools' });
    }
  });

  app.put('/api/schools/:npsn', async (req, res) => {
    const { npsn } = req.params;
    const { name, region } = req.body;

    try {
      const school = await prisma.school.update({
        where: { npsn },
        data: { name, region }
      });
      await Promise.all([deleteCache('api:schools'), deleteCache('api:users')]);
      res.json({ message: 'School updated successfully', school });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update school' });
    }
  });

  app.delete('/api/schools/:npsn', async (req, res) => {
    const { npsn } = req.params;
    try {
      await prisma.school.delete({ where: { npsn } });
      await Promise.all([deleteCache('api:schools'), deleteCache('api:users')]);
      res.json({ message: 'School deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete school' });
    }
  });

  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { username },
        include: { school: true }
      });

      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      let isPasswordValid = false;
      // Cek apakah password tersimpan dalam format hash bcrypt ($2a$ atau $2b$)
      if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
        isPasswordValid = await bcrypt.compare(password, user.password);
      } else {
        // Fallback untuk akun lama dengan password plaintext
        isPasswordValid = (user.password === password);
        if (isPasswordValid) {
          // Otomatis upgrade password plaintext menjadi hash bcrypt di database
          const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
          await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword, ...(user.role === 'siswa' ? { loginCardPassword: loginCards.seal(user.id, password) } : {}) }
          });
        }
      }

      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      // Generate token sesi unik untuk login perangkat ini
      const sessionToken = crypto.randomUUID();

      // Simpan token aktif di PostgreSQL
      await prisma.user.update({
        where: { id: user.id },
        data: { activeToken: sessionToken }
      });

      // Generate JWT token (8 jam)
      const token = jwt.sign(
        {
          id: user.id,
          sid: sessionToken,
          username: user.username,
          role: user.role,
          fullName: user.fullName,
          schoolNpsn: user.schoolNpsn
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.set('Cache-Control', 'no-store');
      res.json({
        message: 'Login successful',
        token, // JWT Token untuk Bearer Authorization
        sessionToken,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          fullName: user.fullName,
          nisn: user.nisn ?? null,
          className: user.className ?? null,
          schoolNpsn: user.schoolNpsn ?? null,
          school: user.school,
          activeToken: sessionToken
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: 'Internal server error during login' });
    }
  });

  // Endpoint untuk cek keabsahan sesi (Heartbeat Single Device Check)
  app.get('/api/auth/session-check', async (req, res) => {
    if (req.query.studentId && req.query.studentId !== req.user!.id) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    return res.json({ status: 'valid' });
  });

  const questionContent = (value: unknown) => {
    if (value !== undefined && typeof value !== 'string') throw new RichContentError('Isi soal dan pilihan harus berupa teks atau konten editor.');
    validateContentField(value);
    if (typeof value === 'string' && parseRichContent(value) && !contentHasValue(value)) throw new RichContentError('Konten editor tidak boleh kosong.');
    return typeof value === 'string' && parseRichContent(value) ? encodeRichContent(parseRichContent(value)!) : value;
  };
  const validateQuestionContent = (body: Record<string, unknown>) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RichContentError('Konten soal tidak valid.');
    if ('readingId' in body || 'reading' in body) throw new RichContentError('Bacaan harus ditulis langsung pada isi soal.');
    body.content = questionContent(body.content);
    if (body.imageUrl && !safeImageUrl(body.imageUrl)) throw new RichContentError('Alamat gambar soal tidak valid.');
    if (Array.isArray(body.options)) body.options = body.options.map(option => {
      if (!option || typeof option !== 'object') throw new RichContentError('Pilihan jawaban tidak valid.');
      return { ...option, text: questionContent(option.text) };
    });
  };
  app.post('/api/questions', async (req, res) => {
    try { validateQuestionContent(req.body); } catch (error) { return res.status(400).json({ error: 'INVALID_CONTENT', message: error instanceof Error ? error.message : 'Konten tidak valid.' }); }
    const { type, mapel, element, content, imageUrl, options, correctAnswer } = req.body;
    if (!content || !type || !mapel || !element) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const question = await prisma.question.create({
        data: {
          type,
          mapel,
          element,
          content,
          imageUrl: imageUrl || null,
          options: options || [],
          correctAnswer: correctAnswer || [],
          authorId: req.user!.id,
        }
      });
      await Promise.all([deleteCache('v2:api:questions:all'), deleteCache(`v2:api:questions:${question.authorId || req.user!.id}`)]);
      res.json(question);
    } catch (error) {
      console.error("Create question error:", error);
      res.status(500).json({ error: 'Failed to create question' });
    }
  });

  app.put('/api/questions/:id', async (req, res) => {
    try {
      validateQuestionContent(req.body);
      const { type, mapel, element, content, imageUrl, options, correctAnswer } = req.body;
      const question = await examTransaction(prisma, async tx => {
        await lockExamContent(tx, true);
        await assertContentEditable(tx, 'question', req.params.id);
        return await tx.question.update({
          where: { id: req.params.id },
          data: {
            type,
            mapel,
            element,
            content,
            imageUrl: imageUrl || null,
            options: options || [],
            correctAnswer: correctAnswer || [],
          }
        });
      });
      await Promise.all([deleteCache('v2:api:questions:all'), deleteCache(`v2:api:questions:${question.authorId || req.user!.id}`)]);
      res.json(question);
    } catch (error) {
      if (error instanceof RichContentError) return res.status(400).json({ error: 'INVALID_CONTENT', message: error.message });
      if (error instanceof ExamError) return res.status(error.status).json({ error: error.code, message: error.message });
      console.error("Update question error:", error);
      res.status(500).json({ error: 'Failed to update question' });
    }
  });

  app.delete('/api/questions/:id', async (req, res) => {
    try {
      const question = await examTransaction(prisma, async tx => {
        await lockExamContent(tx, true);
        await assertContentEditable(tx, 'question', req.params.id);
        return await tx.question.delete({ where: { id: req.params.id } });
      });
      await Promise.all([deleteCache('v2:api:questions:all'), deleteCache(`v2:api:questions:${question.authorId || req.user!.id}`)]);
      res.json({ message: 'Deleted successfully' });
    } catch (error) {
      if (error instanceof ExamError) return res.status(error.status).json({ error: error.code, message: error.message });
      res.status(500).json({ error: 'Failed to delete question' });
    }
  });

  app.get('/api/analytics/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    try {
      if (req.user!.role === 'operator') {
        const owned = await prisma.examSession.findFirst({
          where: { id: sessionId, student: { schoolNpsn: req.user!.schoolNpsn }, status: 'selesai' },
          select: { id: true }
        });
        if (!owned) return res.status(403).json({ error: 'FORBIDDEN' });
      }
      const data = await (async () => {
        const questionAccess = isAdmin(req.user!.role)
          ? true
          : { select: studentQuestionSelect };
        const session = await prisma.examSession.findUnique({
          where: { id: sessionId },
          include: {
            student: { select: safeUserSelect },
            package: { include: { questions: { include: { question: questionAccess } } } },
            answers: { select: { id: true, questionId: true, answerData: true, isCorrect: true } }
          }
        });

        if (!session) return null;

        // We also want to compute average score for this package to show comparison
        const scores = await prisma.examSession.aggregate({
          where: { packageId: session.packageId, status: 'selesai',
            ...(req.user!.role === 'operator' ? { student: { schoolNpsn: req.user!.schoolNpsn } } : {}) },
          _avg: { totalScore: true }
        });
        const averageScore = Number(scores._avg.totalScore || 0);

        if (!isAdmin(req.user!.role)) session.package.token = null;
        return { session, averageScore, rank: 0 };
      })();

      if (!data) return res.status(404).json({ error: 'Session not found' });

      res.json(data);
    } catch (error) {
      console.error("Detailed analytics error:", error);
      res.status(500).json({ error: 'Failed to fetch session detail' });
    }
  });

  const examFailure = (res: express.Response, error: unknown) => {
    if (error instanceof ExamError) return res.status(error.status).json({ error: error.code, message: error.message });
    console.error('Exam operation failed:', error);
    return res.status(500).json({ error: 'EXAM_OPERATION_FAILED', message: 'Operasi ujian gagal. Silakan coba kembali.' });
  };

  app.post('/api/sessions/start', async (req, res) => {
    try {
      const exam = await startExam(prisma, req.user!.id, req.body?.token);
      // Refresh the authenticated student's display profile, including old cached logins.
      const student = await prisma.user.findUnique({ where: { id: req.user!.id }, select: safeUserSelect });
      res.set('Cache-Control', 'no-store');
      res.json({ ...exam, student });
    } catch (error) { examFailure(res, error); }
  });

  app.post('/api/sessions/:sessionId/answer', async (req, res) => {
    try {
      const result = await saveExamAnswer(prisma, req.user!.id, req.params.sessionId, req.body?.questionId, req.body?.answerData,
        { version: req.body?.version, mutationId: req.body?.mutationId });
      res.status('error' in result ? 409 : 200).json(result);
    } catch (error) { examFailure(res, error); }
  });

  app.post('/api/sessions/:sessionId/finish', async (req, res) => {
    try {
      res.json(await finishExam(prisma, req.user!.id, req.params.sessionId, req.body?.expectedAnswers));
    } catch (error) { examFailure(res, error); }
  });

  app.post('/api/users/siswa', async (req, res) => {
    const { nisn, fullName, className } = req.body;
    const schoolNpsn = req.user!.role === 'operator' ? req.user!.schoolNpsn : req.body.schoolNpsn;
    if (req.user!.role === 'operator' && req.body.schoolNpsn && req.body.schoolNpsn !== schoolNpsn) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (!nisn || !fullName) {
      return res.status(400).json({ error: 'NISN and Nama Lengkap are required' });
    }

    try {
      // Check if user already exists
      const existing = await prisma.user.findUnique({ where: { username: nisn } });
      if (existing) {
        return res.status(400).json({ error: 'Siswa with this NISN already exists' });
      }

      // Generate a cryptographically random temporary password
      const tempPassword = studentPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

      const id = crypto.randomUUID();
      const newUser = await prisma.user.create({
        data: {
          id,
          loginCardPassword: loginCards.seal(id, tempPassword),
          username: nisn,
          password: hashedPassword,
          role: 'siswa',
          fullName,
          nisn,
          className,
          ...(schoolNpsn && { schoolNpsn })
        },
        select: safeUserSelect
      });

      await deleteCache('api:users');
      res.set('Cache-Control', 'no-store');
      res.json({ message: 'Siswa created successfully', user: { ...newUser, tempPassword } });
    } catch (error) {
      console.error("Create siswa error:", error);
      res.status(500).json({ error: 'Internal server error while creating siswa' });
    }
  });

  app.post('/api/users/siswa/batch', async (req, res) => {
    const { students } = req.body;
    const schoolNpsn = req.user!.role === 'operator' ? req.user!.schoolNpsn : req.body.schoolNpsn;
    if (req.user!.role === 'operator' && ((req.body.schoolNpsn && req.body.schoolNpsn !== schoolNpsn) ||
        (Array.isArray(students) && students.some((s: any) => s.schoolNpsn && s.schoolNpsn !== schoolNpsn)))) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (!Array.isArray(students)) return res.status(400).json({ error: 'Invalid data' });

    try {
      const credentials: { username: string; tempPassword: string }[] = [];
      const dataToInsert = await Promise.all(students.filter((s: any, i: number) => students.findIndex((other: any) => other.nisn === s.nisn) === i).map(async s => {
        const tempPassword = studentPassword();
        credentials.push({ username: s.nisn, tempPassword });
        const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
        const id = crypto.randomUUID();
        return {
          id,
          loginCardPassword: loginCards.seal(id, tempPassword),
          username: s.nisn,
          password: hashedPassword,
          role: 'siswa',
          fullName: s.fullName,
          nisn: s.nisn,
          className: s.className || '',
          schoolNpsn: schoolNpsn || s.schoolNpsn
        };
      }));

      // INSERT ... RETURNING identifies successful inserts even with duplicate usernames.
      const inserted = await prisma.user.createManyAndReturn({
        data: dataToInsert,
        skipDuplicates: true,
        select: { username: true }
      });
      const usernames = new Set(inserted.map(user => user.username));
      const issued = new Set<string>();
      const createdCredentials = credentials.filter(c => {
        if (!usernames.has(c.username) || issued.has(c.username)) return false;
        issued.add(c.username);
        return true;
      });
      res.set('Cache-Control', 'no-store');
      res.json({ message: `Successfully imported ${inserted.length} students`, count: inserted.length, credentials: createdCredentials });
    } catch (error) {
      console.error("Batch insert siswa error:", error);
      res.status(500).json({ error: 'Failed to import students' });
    }
  });

  // Serve static frontend files in production
  const frontendDistPath = paths.frontend;
  app.use(express.static(frontendDistPath));

  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendDistPath, 'index.html'));
    } else {
      next();
    }
  });

  return app;
}
