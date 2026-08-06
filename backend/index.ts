import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
