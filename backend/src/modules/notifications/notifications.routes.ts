import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// GET /notifications
// My latest 50 notifications (newest first) + how many are still unread.
// The unread count is what the bell icon will display.
// ---------------------------------------------------------------------------
router.get("/notifications", authenticate, async (req, res) => {
  const userId = req.user!.userId;

  const listResult = await pool.query(
    `SELECT id, title, body, link, is_read, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId],
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS unread_count
     FROM notifications
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId],
  );

  res.json({
    notifications: listResult.rows,
    unread_count: countResult.rows[0].unread_count,
  });
});

// ---------------------------------------------------------------------------
// PUT /notifications/read-all
// "Mark all as read" button. Only ever touches the CURRENT user's rows.
// ---------------------------------------------------------------------------
router.put("/notifications/read-all", authenticate, async (req, res) => {
  const userId = req.user!.userId;

  const result = await pool.query(
    `UPDATE notifications SET is_read = TRUE
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId],
  );

  res.json({ marked_read: result.rowCount });
});

// ---------------------------------------------------------------------------
// PUT /notifications/:id/read
// Mark one notification as read. The "AND user_id = $2" part is important:
// it means you can never mark (or even discover) someone else's notification.
// ---------------------------------------------------------------------------
router.put("/notifications/:id/read", authenticate, async (req, res) => {
  const id = req.params.id as string;
  const userId = req.user!.userId;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "id must be a valid UUID" },
    });
  }

  const result = await pool.query(
    `UPDATE notifications SET is_read = TRUE
     WHERE id = $1 AND user_id = $2
     RETURNING id, title, body, link, is_read, created_at`,
    [id, userId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Notification not found" },
    });
  }

  res.json({ notification: result.rows[0] });
});

export default router;
