import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getOrSetCache, deleteCache } from './cache.js';
import { authorizeApi, safeUserSelect, studentQuestionSelect, isAdmin, validRoles, temporaryPassword } from './security.js';

const BCRYPT_ROUNDS = 10;
const JWT_EXPIRES_IN = '8h';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { ExamError, startExam, saveExamAnswer, finishExam, examTransaction, lockExamContent, assertContentEditable } from './exam.js';

import { Storage } from '@google-cloud/storage';

export function createApp(prisma: PrismaClient, JWT_SECRET: string) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.use('/api', authorizeApi(prisma, JWT_SECRET));

  const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'LOCAL'; // 'LOCAL' or 'GCP'

  const uploadDir = path.join(__dirname, 'uploads');
  if (STORAGE_PROVIDER === 'LOCAL' && !fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Storage for Local
  const diskStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
      cb(null, uniqueSuffix + path.extname(file.originalname))
    }
  });

  // Storage for GCP
  const memoryStorage = multer.memoryStorage();

  const upload = multer({
    storage: STORAGE_PROVIDER === 'GCP' ? memoryStorage : diskStorage
  });

  let gcpStorage: Storage | null = null;
  let bucketName = process.env.GCP_BUCKET_NAME || '';

  if (STORAGE_PROVIDER === 'GCP') {
    const gcpOptions: any = {};
    if (process.env.GCP_PROJECT_ID) gcpOptions.projectId = process.env.GCP_PROJECT_ID;
    if (process.env.GCP_KEY_FILE_PATH) gcpOptions.keyFilename = process.env.GCP_KEY_FILE_PATH;
    gcpStorage = new Storage(gcpOptions);
  }

  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    if (STORAGE_PROVIDER === 'GCP' && gcpStorage) {
      const bucket = gcpStorage.bucket(bucketName);
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const blobName = uniqueSuffix + path.extname(req.file.originalname);
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

  // Example route: Get all packages
  app.get('/api/packages', async (req, res) => {
    try {
      const packages = await getOrSetCache('v2:api:packages', 60, async () => {
        return await prisma.package.findMany({
          include: {
            _count: { select: { questions: true } },
            questions: true
          }
        });
      });
      res.json(isAdmin(req.user!.role) ? packages : packages.map(({ token: _token, ...pkg }) => pkg));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch packages' });
    }
  });

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

  app.get('/api/users', async (req, res) => {
    try {
      const schoolNpsn = req.user!.role === 'operator' ? req.user!.schoolNpsn! : null;
      const users = await prisma.user.findMany({
        where: schoolNpsn ? { schoolNpsn, role: 'siswa' } : {},
        select: safeUserSelect
      });
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
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

      const newUser = await prisma.user.create({
        data: {
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
      if (password && password.trim() !== '') {
        finalPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          username: username || existingUser.username,
          password: finalPassword,
          fullName: fullName || existingUser.fullName,
          role: role || existingUser.role,
          schoolNpsn: schoolNpsn !== undefined ? schoolNpsn || null : existingUser.schoolNpsn,
          ...(password && password.trim() !== '' ? { activeToken: null } : {})
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
  app.get('/api/schools', async (req, res) => {
    try {
      const schools = await getOrSetCache('api:schools', 3600, async () => {
        return await prisma.school.findMany({
          include: {
            _count: { select: { users: true } }
          }
        });
      });
      res.json(schools);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch schools' });
    }
  });

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

      await deleteCache('api:schools');
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

      await deleteCache('api:schools');
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
      await deleteCache('api:schools');
      res.json({ message: 'School updated successfully', school });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update school' });
    }
  });

  app.delete('/api/schools/:npsn', async (req, res) => {
    const { npsn } = req.params;
    try {
      await prisma.school.delete({ where: { npsn } });
      await deleteCache('api:schools');
      res.json({ message: 'School deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete school' });
    }
  });

  // Reading Text CRUD
  app.get('/api/readings', async (req, res) => {
    try {
      const readings = await getOrSetCache(`v2:api:readings:${isAdmin(req.user!.role) ? 'all' : req.user!.id}`, 1800, async () => {
        return await prisma.readingText.findMany({
          where: isAdmin(req.user!.role) ? {} : { authorId: req.user!.id },
          include: { _count: { select: { questions: true } } }
        });
      });
      res.json(readings);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch readings' });
    }
  });

  app.post('/api/readings', async (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });
    try {
      const reading = await prisma.readingText.create({ data: { title, content, authorId: req.user!.id } });
      await Promise.all([deleteCache('v2:api:readings:all'), deleteCache(`v2:api:readings:${reading.authorId || req.user!.id}`)]);
      res.json(reading);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create reading' });
    }
  });

  app.put('/api/readings/:id', async (req, res) => {
    const { title, content } = req.body;
    try {
      const reading = await examTransaction(prisma, async tx => {
        await lockExamContent(tx, true);
        await assertContentEditable(tx, 'reading', req.params.id);
        return await tx.readingText.update({
          where: { id: req.params.id },
          data: { title, content }
        });
      });
      await Promise.all([deleteCache('v2:api:readings:all'), deleteCache(`v2:api:readings:${reading.authorId || req.user!.id}`)]);
      res.json(reading);
    } catch (error) {
      if (error instanceof ExamError) return res.status(error.status).json({ error: error.code, message: error.message });
      res.status(500).json({ error: 'Failed to update reading' });
    }
  });

  app.delete('/api/readings/:id', async (req, res) => {
    try {
      const reading = await examTransaction(prisma, async tx => {
        await lockExamContent(tx, true);
        await assertContentEditable(tx, 'reading', req.params.id);
        return await tx.readingText.delete({ where: { id: req.params.id } });
      });
      await Promise.all([deleteCache('v2:api:readings:all'), deleteCache(`v2:api:readings:${reading.authorId || req.user!.id}`)]);
      res.json({ message: 'Deleted successfully' });
    } catch (error) {
      if (error instanceof ExamError) return res.status(error.status).json({ error: error.code, message: error.message });
      res.status(500).json({ error: 'Failed to delete reading' });
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
            data: { password: hashedPassword }
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

  app.get('/api/questions', async (req, res) => {
    try {
      const questions = await getOrSetCache(`v2:api:questions:${isAdmin(req.user!.role) ? 'all' : req.user!.id}`, 1800, async () => {
        return await prisma.question.findMany({ where: isAdmin(req.user!.role) ? {} : { authorId: req.user!.id } });
      });
      res.json(questions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch questions' });
    }
  });

  app.post('/api/questions', async (req, res) => {
    const { type, mapel, element, content, imageUrl, options, correctAnswer, readingId } = req.body;
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
          readingId: readingId !== undefined ? readingId : undefined,
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
      const { type, mapel, element, content, imageUrl, options, correctAnswer, readingId } = req.body;
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
            readingId: readingId !== undefined ? readingId : undefined,
          }
        });
      });
      await Promise.all([deleteCache('v2:api:questions:all'), deleteCache(`v2:api:questions:${question.authorId || req.user!.id}`)]);
      res.json(question);
    } catch (error) {
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

  app.get('/api/sessions', async (req, res) => {
    try {
      const schoolNpsn = req.user!.role === 'operator' ? req.user!.schoolNpsn : req.query.schoolNpsn;
      if (req.user!.role === 'operator' && req.query.schoolNpsn && req.query.schoolNpsn !== schoolNpsn) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
      const whereClause = schoolNpsn ? {
        student: {
          schoolNpsn: String(schoolNpsn)
        }
      } : {};

      const sessions = await prisma.examSession.findMany({
        where: whereClause,
        include: { student: { select: safeUserSelect }, package: true }
      });
      res.json(isAdmin(req.user!.role) ? sessions : sessions.map(s => {
        const { token: _token, ...pkg } = s.package;
        return { ...s, package: pkg };
      }));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch sessions' });
    }
  });

  app.get('/api/analytics/packages', async (req, res) => {
    try {
      const packages = await getOrSetCache('api:analytics:packages_dropdown', 300, async () => {
        return await prisma.package.findMany({
          where: { examSessions: { some: { status: 'selesai' } } },
          select: { id: true, name: true, mapel: true }
        });
      });
      res.json(packages);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch analytics packages' });
    }
  });

  app.get('/api/analytics/packages/:packageId', async (req, res) => {
    const { packageId } = req.params;
    try {
      const data = await getOrSetCache(`api:analytics:pkg:${packageId}:summary`, 300, async () => {
        const allStudents = await prisma.user.findMany({
          where: { role: 'siswa' },
          include: {
            school: true,
            examSessions: { where: { packageId } }
          }
        });

        if (allStudents.length === 0) return { summary: null, schools: [] };

        let total = 0, highest = -1, lowest = 101;
        const schoolGroups: Record<string, { npsn: string, name: string, count: number, sum: number }> = {};

        allStudents.forEach(student => {
          const session = student.examSessions[0];
          const score = (session && session.status === 'selesai') ? Number(session.totalScore || 0) : 0;

          total += score;
          if (score > highest) highest = score;
          if (score < lowest) lowest = score;

          const npsn = student.schoolNpsn || 'UNKNOWN';
          const name = student.school?.name || 'Tanpa Sekolah';

          if (!schoolGroups[npsn]) schoolGroups[npsn] = { npsn, name, count: 0, sum: 0 };
          schoolGroups[npsn].count += 1;
          schoolGroups[npsn].sum += score;
        });

        const average = total / allStudents.length;
        const schools = Object.values(schoolGroups).map(sg => ({
          npsn: sg.npsn,
          name: sg.name,
          participantCount: sg.count,
          averageScore: sg.sum / sg.count
        }));

        return {
          summary: { average, highest: highest === -1 ? 0 : highest, lowest: lowest === 101 ? 0 : lowest, totalParticipants: allStudents.length },
          schools
        };
      });

      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch package analytics' });
    }
  });

  app.get('/api/analytics/packages/:packageId/schools/:schoolNpsn', async (req, res) => {
    const { packageId, schoolNpsn } = req.params;
    try {
      const data = await getOrSetCache(`api:analytics:pkg:${packageId}:school:${schoolNpsn}`, 300, async () => {
        const npsnFilter = schoolNpsn === 'UNKNOWN' ? null : schoolNpsn;

        const allStudents = await prisma.user.findMany({
          where: { role: 'siswa', schoolNpsn: npsnFilter },
          include: {
            school: true,
            examSessions: {
              where: { packageId },
              include: { answers: { include: { question: true } } }
            }
          }
        });

        return allStudents.map(student => {
          const session = student.examSessions[0];
          const isFinished = session && session.status === 'selesai';
          const elementBreakdown: Record<string, { total: number, correct: number }> = {};

          if (isFinished && session.answers) {
            session.answers.forEach((ans: any) => {
              const el = ans.question.element || 'Umum';
              if (!elementBreakdown[el]) elementBreakdown[el] = { total: 0, correct: 0 };
              elementBreakdown[el].total += 1;
              if (ans.isCorrect) elementBreakdown[el].correct += 1;
            });
          }

          return {
            sessionId: session?.id || null,
            studentName: student.fullName,
            nisn: student.username,
            npsn: student.schoolNpsn || '-',
            school: student.school?.name || '-',
            score: isFinished ? session.totalScore : 0,
            endTime: isFinished ? session.endTime : null,
            startTime: session ? session.startTime : null,
            elementBreakdown,
            status: isFinished ? 'Selesai' : (session ? 'Sedang Mengerjakan' : 'Tidak Mengerjakan')
          };
        });
      });

      res.json(data);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch school analytics' });
    }
  });

  app.get('/api/analytics/packages/:packageId/all-students', async (req, res) => {
    const { packageId } = req.params;
    try {
      const data = await getOrSetCache(`api:analytics:pkg:${packageId}:all_students`, 300, async () => {
        const allStudents = await prisma.user.findMany({
          where: { role: 'siswa' },
          include: {
            school: true,
            examSessions: {
              where: { packageId },
              include: { answers: { include: { question: true } } }
            }
          }
        });

        return allStudents.map(student => {
          const session = student.examSessions[0];
          const isFinished = session && session.status === 'selesai';
          const elementBreakdown: Record<string, { total: number, correct: number }> = {};

          if (isFinished && session.answers) {
            session.answers.forEach((ans: any) => {
              const el = ans.question.element || 'Umum';
              if (!elementBreakdown[el]) elementBreakdown[el] = { total: 0, correct: 0 };
              elementBreakdown[el].total += 1;
              if (ans.isCorrect) elementBreakdown[el].correct += 1;
            });
          }

          return {
            sessionId: session?.id || null,
            studentName: student.fullName,
            nisn: student.username,
            npsn: student.schoolNpsn || '-',
            school: student.school?.name || '-',
            score: isFinished ? session.totalScore : 0,
            startTime: session ? session.startTime : null,
            endTime: isFinished ? session.endTime : null,
            elementBreakdown,
            status: isFinished ? 'Selesai' : (session ? 'Sedang Mengerjakan' : 'Tidak Mengerjakan')
          };
        });
      });

      res.json(data);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch all students analytics' });
    }
  });

  app.get('/api/analytics/packages/:packageId/items', async (req, res) => {
    const { packageId } = req.params;
    try {
      const data = await getOrSetCache(`api:analytics:pkg:${packageId}:items`, 300, async () => {
        const pkg = await prisma.package.findUnique({
          where: { id: packageId },
          include: {
            questions: {
              include: { question: true }
            }
          }
        });

        if (!pkg) return null;

        const sessions = await prisma.examSession.findMany({
          where: { packageId, status: 'selesai' },
          include: { answers: true }
        });

        const items = pkg.questions.map((pq, idx) => {
          const qId = pq.questionId;
          let totalAttempts = 0;
          let correctCount = 0;

          sessions.forEach(session => {
            const answer = session.answers.find(a => a.questionId === qId);
            if (answer) {
              totalAttempts++;
              if (answer.isCorrect) {
                correctCount++;
              }
            }
          });

          const difficultyIndex = totalAttempts > 0 ? (correctCount / totalAttempts) : 0;
          let category = 'Sedang';
          if (difficultyIndex > 0.7) category = 'Mudah';
          else if (difficultyIndex < 0.3) category = 'Sulit';

          return {
            questionId: qId,
            questionNumber: idx + 1,
            content: pq.question.content,
            cognitiveLevel: (pq.question as any).cognitiveLevel || 'C3',
            totalAttempts,
            correctCount,
            difficultyIndex,
            category
          };
        });

        return { package: pkg.name, items };
      });

      if (!data) return res.status(404).json({ error: 'Package not found' });

      res.json(data);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch item analytics' });
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
      const data = await getOrSetCache(`v2:api:analytics:session:${sessionId}:${req.user!.role}:${req.user!.schoolNpsn || 'all'}`, 300, async () => {
        const questionAccess = isAdmin(req.user!.role)
          ? { include: { reading: true } } as const
          : { select: studentQuestionSelect };
        const session = await prisma.examSession.findUnique({
          where: { id: sessionId },
          include: {
            student: { select: safeUserSelect },
            package: { include: { questions: { include: { question: questionAccess } } } },
            answers: { include: { question: questionAccess } }
          }
        });

        if (!session) return null;

        // We also want to compute average score for this package to show comparison
        const packageSessions = await prisma.examSession.findMany({
          where: { packageId: session.packageId, status: 'selesai',
            ...(req.user!.role === 'operator' ? { student: { schoolNpsn: req.user!.schoolNpsn } } : {}) },
          select: { totalScore: true }
        });

        let totalScoreSum = 0;
        let validCount = 0;
        packageSessions.forEach(s => {
          if (s.totalScore !== null) {
            totalScoreSum += Number(s.totalScore);
            validCount++;
          }
        });
        const averageScore = validCount > 0 ? totalScoreSum / validCount : 0;

        if (!isAdmin(req.user!.role)) session.package.token = null;
        return { session, averageScore, rank: 0 };
      });

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
      res.json(await startExam(prisma, req.user!.id, req.body?.token));
    } catch (error) { examFailure(res, error); }
  });

  app.post('/api/sessions/:sessionId/answer', async (req, res) => {
    try {
      const result = await saveExamAnswer(prisma, req.user!.id, req.params.sessionId, req.body?.questionId, req.body?.answerData);
      res.status('error' in result ? 409 : 200).json(result);
    } catch (error) { examFailure(res, error); }
  });

  app.post('/api/sessions/:sessionId/finish', async (req, res) => {
    try {
      res.json(await finishExam(prisma, req.user!.id, req.params.sessionId));
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
      const tempPassword = temporaryPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

      const newUser = await prisma.user.create({
        data: {
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
        const tempPassword = temporaryPassword();
        credentials.push({ username: s.nisn, tempPassword });
        const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
        return {
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
  const frontendDistPath = path.join(__dirname, '../dist');
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
