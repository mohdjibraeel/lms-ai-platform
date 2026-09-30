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

// ---------------------------------------------------------------------------
// GET /admin/users
// Lists every user with their role and active status.
// ---------------------------------------------------------------------------
router.get(
  "/admin/users",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.is_active, u.created_at, r.name AS role
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       ORDER BY u.created_at DESC`,
    );

    res.json({ users: result.rows });
  },
);

// ---------------------------------------------------------------------------
// PUT /admin/users/:id/deactivate
// "Delete" per FR-AD2 — a soft deactivation (is_active = false), not a
// permanent delete, since other tables reference users without cascade.
// ---------------------------------------------------------------------------
router.put(
  "/admin/users/:id/deactivate",
  authenticate,
  requireRole("admin"),
  async (req: any, res) => {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({
        error: {
          code: "CANNOT_MODIFY_SELF",
          message: "You cannot deactivate your own account",
        },
      });
    }

    const result = await pool.query(
      `UPDATE users SET is_active = false WHERE id = $1 RETURNING id, full_name, is_active`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "User not found" } });
    }

    res.json({ user: result.rows[0] });
  },
);

// ---------------------------------------------------------------------------
// PUT /admin/users/:id/reactivate
// ---------------------------------------------------------------------------
router.put(
  "/admin/users/:id/reactivate",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const result = await pool.query(
      `UPDATE users SET is_active = true WHERE id = $1 RETURNING id, full_name, is_active`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "User not found" } });
    }

    res.json({ user: result.rows[0] });
  },
);

// ---------------------------------------------------------------------------
// PUT /admin/users/:id/role
// Body: { role: "student" | "instructor" | "admin" }
// Updates the user's single role row directly, matching how the rest of
// this app treats role as one value per user (not true multi-role).
// ---------------------------------------------------------------------------
router.put(
  "/admin/users/:id/role",
  authenticate,
  requireRole("admin"),
  async (req: any, res) => {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({
        error: {
          code: "CANNOT_MODIFY_SELF",
          message: "You cannot change your own role",
        },
      });
    }

    const { role } = req.body;
    const validRoles = ["student", "instructor", "admin"];

    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `role must be one of: ${validRoles.join(", ")}`,
        },
      });
    }

    const result = await pool.query(
      `UPDATE user_roles SET role_id = (SELECT id FROM roles WHERE name = $1)
       WHERE user_id = $2
       RETURNING user_id`,
      [role, req.params.id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "User not found" } });
    }

    res.json({ user_id: req.params.id, role });
  },
);

// ---------------------------------------------------------------------------
// GET /admin/analytics/overview
// Platform-wide metrics. Revenue is deliberately excluded — there is no
// payments/transactions table in this schema, so a real revenue figure
// doesn't exist yet; showing courses.price × enrollments would imply real
// money changed hands, which isn't true.
// "Active learners today" (not a true DAU) is the closest honest proxy
// available: the only activity timestamp anywhere is streaks.last_active_date,
// which only updates when a student watches part of a lecture — not on
// login, quiz-taking, or assignment submission.
// ---------------------------------------------------------------------------
router.get(
  "/admin/analytics/overview",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const activeTodayResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM streaks WHERE last_active_date = CURRENT_DATE`,
    );

    const enrollmentsResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM enrollments`,
    );

    const completionResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE progress_percent = 100)::int AS completed
       FROM enrollments`,
    );

    const totalEnrollments = completionResult.rows[0].total;
    const completedEnrollments = completionResult.rows[0].completed;
    const completionRate =
      totalEnrollments > 0
        ? Math.round((completedEnrollments / totalEnrollments) * 1000) / 10
        : 0;

    res.json({
      active_learners_today: activeTodayResult.rows[0].count,
      total_enrollments: enrollmentsResult.rows[0].total,
      completion_rate_percent: completionRate,
    });
  },
);
// ---------------------------------------------------------------------------
// GET /admin/discussions/flagged
// Every flagged post, across every course, newest-flagged-looking-first
// (we don't track WHEN it was flagged yet, so we sort by post recency —
// good enough for a first version). Gives the admin everything needed to
// judge it: which course/thread it's in, who wrote it, and the text itself.
// ---------------------------------------------------------------------------
router.get(
  "/admin/discussions/flagged",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const result = await pool.query(
      `SELECT p.id, p.content, p.created_at,
              u.full_name AS posted_by_name, u.email AS posted_by_email,
              t.id AS thread_id, t.title AS thread_title,
              c.id AS course_id, c.title AS course_title
       FROM discussion_posts p
       JOIN discussion_threads t ON t.id = p.thread_id
       JOIN courses c ON c.id = t.course_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.is_flagged = TRUE
       ORDER BY p.created_at DESC`,
    );

    res.json({ posts: result.rows });
  },
);

// ---------------------------------------------------------------------------
// PUT /admin/discussions/posts/:id/remove
// The flag was justified — delete the post entirely. Deleting a post never
// deletes its thread, even if it was the opening post, so the conversation
// (and any replies) stays intact rather than vanishing along with it.
// ---------------------------------------------------------------------------
router.put(
  "/admin/discussions/posts/:id/remove",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM discussion_posts WHERE id = $1 RETURNING id",
      [id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Post not found" } });
    }

    res.json({ removed: true });
  },
);

// ---------------------------------------------------------------------------
// PUT /admin/discussions/posts/:id/dismiss
// The flag was a false alarm — clear it and leave the post exactly as it
// was, visible to everyone again with no "Flagged" label.
// ---------------------------------------------------------------------------
router.put(
  "/admin/discussions/posts/:id/dismiss",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(
      "UPDATE discussion_posts SET is_flagged = FALSE WHERE id = $1 RETURNING id",
      [id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Post not found" } });
    }

    res.json({ dismissed: true });
  },
);
export default router;
