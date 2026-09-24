import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

// ---------------------------------------------------------------------------
// GET /me/achievements
// Returns the CURRENT user's streak, earned badges, and certificates.
// No ownership/enrollment check needed — this is always "my own" data.
// ---------------------------------------------------------------------------
router.get("/me/achievements", authenticate, async (req: any, res) => {
  const userId = req.user.userId;

  try {
    const streakResult = await pool.query(
      `SELECT current_streak, longest_streak, last_active_date
       FROM streaks WHERE user_id = $1`,
      [userId],
    );

    const badgesResult = await pool.query(
      `SELECT b.id, b.name, b.description, b.icon_url, ub.earned_at
       FROM user_badges ub
       JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1
       ORDER BY ub.earned_at`,
      [userId],
    );

    const certificatesResult = await pool.query(
      `SELECT c.id, c.course_id, co.title AS course_title, c.issued_at
       FROM certificates c
       JOIN courses co ON co.id = c.course_id
       WHERE c.user_id = $1
       ORDER BY c.issued_at DESC`,
      [userId],
    );

    res.json({
      streak: streakResult.rows[0] ?? {
        current_streak: 0,
        longest_streak: 0,
        last_active_date: null,
      },
      badges: badgesResult.rows,
      certificates: certificatesResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: {
        code: "SERVER_ERROR",
        message: "Something went wrong on our side",
      },
    });
  }
});

export default router;
