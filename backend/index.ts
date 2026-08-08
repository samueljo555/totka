import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
});
const upload = multer({ storage: storage });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }
  res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

// Basic health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'TKA Backend API is running' });
});

// Example route: Get all packages
app.get('/api/packages', async (req, res) => {
  try {
    const packages = await prisma.package.findMany({
      include: {
        _count: {
          select: { questions: true }
        }
      }
    });
    res.json(packages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { school: true }
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

  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const newUser = await prisma.user.create({
      data: { 
        username, 
        password, 
        fullName, 
        role,
        ...(schoolNpsn && { schoolNpsn })
      }
    });

    res.json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ error: 'Internal server error while creating user' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, password, fullName, role, schoolNpsn } = req.body;

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

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        username: username || existingUser.username,
        password: password || existingUser.password,
        fullName: fullName || existingUser.fullName,
        role: role || existingUser.role,
        schoolNpsn: schoolNpsn !== undefined ? schoolNpsn : existingUser.schoolNpsn
      }
    });

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
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// School CRUD
app.get('/api/schools', async (req, res) => {
  try {
    const schools = await prisma.school.findMany({
      include: {
        _count: { select: { users: true } }
      }
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
    res.json({ message: `Successfully imported ${result.count} schools` });
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
    res.json({ message: 'School updated successfully', school });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update school' });
  }
});

app.delete('/api/schools/:npsn', async (req, res) => {
  const { npsn } = req.params;
  try {
    await prisma.school.delete({ where: { npsn } });
    res.json({ message: 'School deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete school' });
  }
});

// Reading Text CRUD
app.get('/api/readings', async (req, res) => {
  try {
    const readings = await prisma.readingText.findMany({
      include: { _count: { select: { questions: true } } }
    });
    res.json(readings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch readings' });
  }
});

app.post('/api/readings', async (req, res) => {
  const { title, content, authorId } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });
  try {
    const reading = await prisma.readingText.create({ data: { title, content, authorId } });
    res.json(reading);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create reading' });
  }
});

app.put('/api/readings/:id', async (req, res) => {
  const { title, content } = req.body;
  try {
    const reading = await prisma.readingText.update({
      where: { id: req.params.id },
      data: { title, content }
    });
    res.json(reading);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update reading' });
  }
});

app.delete('/api/readings/:id', async (req, res) => {
  try {
    await prisma.readingText.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
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

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
        school: user.school
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

app.get('/api/questions', async (req, res) => {
  try {
    const questions = await prisma.question.findMany();
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

app.post('/api/questions', async (req, res) => {
  const { type, mapel, element, content, imageUrl, options, correctAnswer, authorId, readingId } = req.body;
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
        ...(authorId && { authorId }),
        ...(readingId && { readingId }),
      }
    });
    res.json(question);
  } catch (error) {
    console.error("Create question error:", error);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

app.delete('/api/questions/:id', async (req, res) => {
  try {
    await prisma.question.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await prisma.examSession.findMany({
      include: { student: true, package: true }
    });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

app.post('/api/sessions/start', async (req, res) => {
  const { studentId, token } = req.body;
  if (!studentId || !token) {
    return res.status(400).json({ error: 'Missing studentId or token' });
  }

  try {
    let packageObj = await prisma.package.findFirst({ where: { token } });
    
    // For development, auto-create or update mock package if token is TEST123
    if (token === 'TEST123') {
       if (!packageObj) {
         packageObj = await prisma.package.create({
           data: {
             name: 'Paket Try Out Simulasi',
             mapel: 'Matematika',
             token: 'TEST123',
             durationMinutes: 90
           }
         });
       }
       // Ensure all questions in DB are linked to this package
       const allQuestions = await prisma.question.findMany();
       const existingLinks = await prisma.packageQuestion.findMany({ where: { packageId: packageObj.id } });
       const existingQuestionIds = new Set(existingLinks.map(l => l.questionId));
       const newLinks = allQuestions.filter(q => !existingQuestionIds.has(q.id));
       
       if (newLinks.length > 0) {
         await prisma.packageQuestion.createMany({
           data: newLinks.map(q => ({ packageId: packageObj!.id, questionId: q.id }))
         });
       }
    } else if (!packageObj) {
      return res.status(404).json({ error: 'Token paket tidak valid' });
    }

    let session = await prisma.examSession.findUnique({
      where: { studentId_packageId: { studentId, packageId: packageObj.id } }
    });

    if (!session) {
      session = await prisma.examSession.create({
        data: {
          studentId,
          packageId: packageObj.id,
          status: 'sedang_mengerjakan'
        }
      });
    }

    const packageQuestions = await prisma.packageQuestion.findMany({
      where: { packageId: packageObj.id },
      include: { question: true }
    });
    const questions = packageQuestions.map(pq => pq.question);

    const existingAnswers = await prisma.answer.findMany({
      where: { sessionId: session.id }
    });

    res.json({ session, package: packageObj, questions, existingAnswers });
  } catch (error) {
    console.error("Start session error:", error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

app.post('/api/sessions/:sessionId/answer', async (req, res) => {
  const { sessionId } = req.params;
  const { questionId, answerData } = req.body;

  try {
    const answer = await prisma.answer.upsert({
      where: { sessionId_questionId: { sessionId, questionId } },
      update: { answerData },
      create: { sessionId, questionId, answerData }
    });
    res.json(answer);
  } catch (error) {
    console.error("Save answer error:", error);
    res.status(500).json({ error: 'Failed to save answer' });
  }
});

app.post('/api/users/siswa', async (req, res) => {
  const { nisn, fullName, className, schoolNpsn } = req.body;
  if (!nisn || !fullName) {
    return res.status(400).json({ error: 'NISN and Nama Lengkap are required' });
  }

  try {
    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { username: nisn } });
    if (existing) {
      return res.status(400).json({ error: 'Siswa with this NISN already exists' });
    }

    // Generate a random temporary password (e.g., 6 chars)
    const tempPassword = Math.random().toString(36).slice(-6).toUpperCase();

    const newUser = await prisma.user.create({
      data: {
        username: nisn,
        password: tempPassword,
        role: 'siswa',
        fullName,
        nisn,
        className,
        ...(schoolNpsn && { schoolNpsn })
      }
    });

    res.json({ message: 'Siswa created successfully', user: newUser });
  } catch (error) {
    console.error("Create siswa error:", error);
    res.status(500).json({ error: 'Internal server error while creating siswa' });
  }
});

app.post('/api/users/siswa/batch', async (req, res) => {
  const { students, schoolNpsn } = req.body;
  if (!Array.isArray(students)) return res.status(400).json({ error: 'Invalid data' });

  const dataToInsert = students.map(s => {
    const tempPassword = Math.random().toString(36).slice(-6).toUpperCase();
    return {
      username: s.nisn,
      password: tempPassword,
      role: 'siswa',
      fullName: s.fullName,
      nisn: s.nisn,
      className: s.className || '',
      schoolNpsn: schoolNpsn || s.schoolNpsn
    };
  });

  try {
    const result = await prisma.user.createMany({
      data: dataToInsert,
      skipDuplicates: true
    });
    res.json({ message: `Successfully imported ${result.count} students` });
  } catch (error) {
    console.error("Batch insert siswa error:", error);
    res.status(500).json({ error: 'Failed to import students' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
