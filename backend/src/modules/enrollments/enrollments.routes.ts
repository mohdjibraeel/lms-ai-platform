import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

// GET /enrollments/me
router.get("/enrollments/me", authenticate, async (req, res) => {
  const user_id = req.user!.userId;

  const result = await pool.query(
    `SELECT e.id AS enrollment_id, e.enrolled_at, e.progress_percent,
            c.id AS course_id, c.title, c.description, c.category,
            c.difficulty, c.thumbnail_url, c.price
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.user_id = $1
     ORDER BY e.enrolled_at DESC`,
    [user_id],
  );

  res.json({ enrollments: result.rows });
});

export default router;