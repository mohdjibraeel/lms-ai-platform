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
  async (req, res) => {
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
  async (req, res) => {
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

export default router;
