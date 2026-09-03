import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

// ---------------------------------------------------------------------------
// POST /lectures/:id/progress
// Body: { watched_seconds: number, completed?: boolean }
// Upserts a lecture_progress row for (this user's enrollment, this lecture).
// ---------------------------------------------------------------------------
router.post("/lectures/:id/progress", authenticate, async (req: any, res) => {
  const lectureId = req.params.id;
  const userId = req.user.userId;
  const { watched_seconds, completed } = req.body;

  try {
    // 1. Walk lecture -> module -> course to find which course this lecture
    //    belongs to, and confirm the requesting user is enrolled in it.
    const enrollmentResult = await pool.query(
      `SELECT e.id AS enrollment_id, c.id AS course_id
       FROM lectures l
       JOIN modules m ON l.module_id = m.id
       JOIN courses c ON m.course_id = c.id
       JOIN enrollments e ON e.course_id = c.id AND e.user_id = $1
       WHERE l.id = $2`,
      [userId, lectureId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(403).json({ error: "NOT_ENROLLED" });
    }

    const { enrollment_id, course_id } = enrollmentResult.rows[0];

    // 2. Upsert: insert a new progress row, or update the existing one for
    //    this (enrollment_id, lecture_id) pair — that's what the UNIQUE
    //    constraint from migration 006 enables.
    await pool.query(
      `INSERT INTO lecture_progress (enrollment_id, lecture_id, watched_seconds, completed, last_watched_at)
       VALUES ($1, $2, $3, COALESCE($4, false), now())
       ON CONFLICT (enrollment_id, lecture_id)
       DO UPDATE SET
         watched_seconds = GREATEST(lecture_progress.watched_seconds, EXCLUDED.watched_seconds),
         completed = lecture_progress.completed OR EXCLUDED.completed,
         last_watched_at = now()`,
      [enrollment_id, lectureId, watched_seconds ?? 0, completed]
    );

    // 3. Recompute enrollments.progress_percent from scratch: what fraction
    //    of this course's lectures are marked completed.
    const totalsResult = await pool.query(
      `SELECT
         COUNT(l.id) AS total_lectures,
         COUNT(lp.id) FILTER (WHERE lp.completed) AS completed_lectures
       FROM lectures l
       JOIN modules m ON l.module_id = m.id
       LEFT JOIN lecture_progress lp
         ON lp.lecture_id = l.id AND lp.enrollment_id = $1
       WHERE m.course_id = $2`,
      [enrollment_id, course_id]
    );

    const { total_lectures, completed_lectures } = totalsResult.rows[0];
    const progressPercent =
      total_lectures > 0 ? (completed_lectures / total_lectures) * 100 : 0;

    await pool.query(
      `UPDATE enrollments SET progress_percent = $1 WHERE id = $2`,
      [progressPercent, enrollment_id]
    );

    res.json({ enrollment_id, lecture_id: lectureId, progress_percent: progressPercent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ---------------------------------------------------------------------------
// POST /lectures/:id/notes
// Body: { timestamp_seconds: number, content: string }
// ---------------------------------------------------------------------------
router.post("/lectures/:id/notes", authenticate, async (req: any, res) => {
  const lectureId = req.params.id;
  const userId = req.user.userId;
  const { timestamp_seconds, content } = req.body;

  if (!content || content.trim() === "") {
    return res.status(400).json({ error: "CONTENT_REQUIRED" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO notes (user_id, lecture_id, timestamp_seconds, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, lecture_id, timestamp_seconds, content, created_at`,
      [userId, lectureId, timestamp_seconds ?? null, content]
    );

    res.status(201).json({ note: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ---------------------------------------------------------------------------
// GET /lectures/:id/notes
// Returns this user's notes for this lecture, oldest timestamp first.
// ---------------------------------------------------------------------------
router.get("/lectures/:id/notes", authenticate, async (req: any, res) => {
  const lectureId = req.params.id;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `SELECT id, lecture_id, timestamp_seconds, content, created_at
       FROM notes
       WHERE lecture_id = $1 AND user_id = $2
       ORDER BY timestamp_seconds ASC`,
      [lectureId, userId]
    );

    res.json({ notes: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ---------------------------------------------------------------------------
// GET /lectures/:id/bookmarks
// Returns this user's bookmarks for this lecture, oldest timestamp first.
// ---------------------------------------------------------------------------
router.get("/lectures/:id/bookmarks", authenticate, async (req: any, res) => {
  const lectureId = req.params.id;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `SELECT id, lecture_id, timestamp_seconds, created_at
       FROM bookmarks
       WHERE lecture_id = $1 AND user_id = $2
       ORDER BY timestamp_seconds ASC`,
      [lectureId, userId]
    );

    res.json({ bookmarks: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ---------------------------------------------------------------------------
// POST /lectures/:id/bookmarks
// Body: { timestamp_seconds: number }
// ---------------------------------------------------------------------------
router.post("/lectures/:id/bookmarks", authenticate, async (req: any, res) => {
  const lectureId = req.params.id;
  const userId = req.user.userId;
  const { timestamp_seconds } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO bookmarks (user_id, lecture_id, timestamp_seconds)
       VALUES ($1, $2, $3)
       RETURNING id, lecture_id, timestamp_seconds, created_at`,
      [userId, lectureId, timestamp_seconds ?? null]
    );

    res.status(201).json({ bookmark: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

export default router;