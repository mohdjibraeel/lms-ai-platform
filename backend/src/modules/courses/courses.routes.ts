import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate, requireRole } from "../../middleware/auth.middleware";

const router = Router();

router.post(
  "/",
  authenticate,
  requireRole("instructor", "admin"),
  async (req, res) => {
    const { title, description, category, difficulty, thumbnail_url, price } =
      req.body;

    if (!title) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "title is required" },
      });
    }

    const instructor_id = req.user!.userId;
    const finalPrice = price ?? 0;

    const result = await pool.query(
      `INSERT INTO courses (instructor_id, title, description, category, difficulty, thumbnail_url, price)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, instructor_id, title, description, category, difficulty, thumbnail_url, price, status, created_at`,
      [
        instructor_id,
        title,
        description,
        category,
        difficulty,
        thumbnail_url,
        finalPrice,
      ],
    );

    res.status(201).json({ course: result.rows[0] });
  },
);

router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT id, instructor_id, title, description, category, difficulty, thumbnail_url, price, status, created_at
     FROM courses
     ORDER BY created_at DESC`
  );
  res.json({ courses: result.rows });
});

export default router;
