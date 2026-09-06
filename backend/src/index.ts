import express from 'express';
import dotenv from 'dotenv';
import cors from "cors";
import authRoutes from './modules/auth/auth.routes';
import { authenticate, requireRole } from './middleware/auth.middleware';
import courseRoutes from './modules/courses/courses.routes';
import { ensureBucketExists } from './storage/minioClient';
dotenv.config();
const app = express();
app.use(express.json());
app.use(cors({ origin: "http://localhost:5173" }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/courses', courseRoutes);
app.get('/api/v1/test/student-only', authenticate, requireRole('student'), (req, res) => {
  res.json({ message: 'You are authenticated as a student', user: req.user });
});

app.get('/api/v1/test/instructor-only', authenticate, requireRole('instructor', 'admin'), (req, res) => {
  res.json({ message: 'You are authenticated as an instructor or admin', user: req.user });
});
const PORT = process.env.PORT || 4000;

async function startServer() {
  await ensureBucketExists();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

startServer();