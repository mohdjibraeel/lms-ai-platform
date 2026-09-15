import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate, requireRole } from "../../middleware/auth.middleware";

const router = Router();

// ---------------------------------------------------------------------------
// GET /admin/courses/pending
// Lists every course awaiting approval, with the instructor's name/email
// so the admin knows who to follow up with if something looks off.
// ---------------------------------------------------------------------------
router.get(
  "/admin/courses/pending",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const result = await pool.query(
      `SELECT c.id, c.title, c.description, c.category, c.difficulty,
              c.created_at, u.full_name AS instructor_name, u.email AS instructor_email
       FROM courses c
       JOIN users u ON u.id = c.instructor_id
       WHERE c.status = 'pending'
       ORDER BY c.created_at ASC`,
    );

    res.json({ courses: result.rows });
  },
);

// ---------------------------------------------------------------------------
// PUT /admin/courses/:id/approve
// ---------------------------------------------------------------------------
router.put(
  "/admin/courses/:id/approve",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const result = await pool.query(
      `UPDATE courses SET status = 'approved' WHERE id = $1 RETURNING id, title, status`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Course not found" } });
    }

    res.json({ course: result.rows[0] });
  },
);

// ---------------------------------------------------------------------------
// PUT /admin/courses/:id/reject
// ---------------------------------------------------------------------------
router.put(
  "/admin/courses/:id/reject",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const result = await pool.query(
      `UPDATE courses SET status = 'rejected' WHERE id = $1 RETURNING id, title, status`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Course not found" } });
    }

    res.json({ course: result.rows[0] });
  },
);

export default router;