import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate, requireRole } from "../../middleware/auth.middleware";

const router = Router();

// ---------------------------------------------------------------------------
// GET /recommendations/me
// Rule-based only (no embeddings, no nightly job — computed live on each
// request): for each course the student is enrolled in, suggest one other
// APPROVED course in the same category they're not already enrolled in.
// Falls back to "any approved course not yet enrolled in" when no
// same-category match exists, so every student gets at least one suggestion.
// ---------------------------------------------------------------------------
router.get(
  "/recommendations/me",
  authenticate,
  requireRole("student"),
  async (req: any, res) => {
    const userId = req.user.userId;

    try {
      const enrolledResult = await pool.query(
        `SELECT c.id, c.category FROM enrollments e
         JOIN courses c ON c.id = e.course_id
         WHERE e.user_id = $1`,
        [userId],
      );
      const enrolledCourseIds = enrolledResult.rows.map((r) => r.id);

      if (enrolledResult.rows.length === 0) {
        return res.json({ recommendations: [] });
      }

      const recommendations: {
        course_id: string;
        title: string;
        category: string;
        difficulty: string;
        reason: string;
      }[] = [];

      for (const enrolled of enrolledResult.rows) {
        // Skip if we already recommended something for this category in
        // an earlier loop iteration (avoids duplicate suggestions when a
        // student is enrolled in two courses of the same category).
        if (recommendations.some((r) => r.category === enrolled.category)) {
          continue;
        }

        const sameCategoryResult = await pool.query(
          `SELECT id, title, category, difficulty
           FROM courses
           WHERE status = 'approved'
             AND category = $1
             AND id != ALL($2::uuid[])
             AND id != $3
           ORDER BY created_at DESC
           LIMIT 1`,
          [enrolled.category, enrolledCourseIds, enrolled.id],
        );

        if (sameCategoryResult.rows.length > 0) {
          const match = sameCategoryResult.rows[0];
          recommendations.push({
            course_id: match.id,
            title: match.title,
            category: match.category,
            difficulty: match.difficulty,
            reason: `Because you're taking a ${enrolled.category} course`,
          });
        }
      }

      // Fallback: if nothing was found via category matching, suggest any
      // other approved course the student isn't enrolled in.
      if (recommendations.length === 0) {
        const fallbackResult = await pool.query(
          `SELECT id, title, category, difficulty
           FROM courses
           WHERE status = 'approved' AND id != ALL($1::uuid[])
           ORDER BY created_at DESC
           LIMIT 1`,
          [enrolledCourseIds],
        );
        if (fallbackResult.rows.length > 0) {
          const match = fallbackResult.rows[0];
          recommendations.push({
            course_id: match.id,
            title: match.title,
            category: match.category,
            difficulty: match.difficulty,
            reason: "You might like this",
          });
        }
      }

      res.json({ recommendations });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: {
          code: "SERVER_ERROR",
          message: "Something went wrong on our side",
        },
      });
    }
  },
);

export default router;
