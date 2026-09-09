import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate, requireRole } from "../../middleware/auth.middleware";

const router = Router();

// ---------------------------------------------------------------------------
// POST /quizzes
// Body: {
//   module_id,
//   title,
//   questions: [
//     { question_text, question_type, order_index,
//       options: [{ option_text, is_correct }] }
//   ]
// }
// Creates a quiz + all its questions + all their options as ONE transaction.
// ---------------------------------------------------------------------------
router.post(
  "/quizzes",
  authenticate,
  requireRole("instructor", "admin"),
  async (req: any, res) => {
    const { module_id, title, questions } = req.body;
    const userId = req.user.userId;

    // Ownership check — module -> course -> does this instructor own it?
    const ownerResult = await pool.query(
      `SELECT c.instructor_id
       FROM modules m
       JOIN courses c ON m.course_id = c.id
       WHERE m.id = $1`,
      [module_id]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ error: "MODULE_NOT_FOUND" });
    }

    const isOwner = ownerResult.rows[0].instructor_id === userId;
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "NOT_COURSE_OWNER" });
    }

    // Borrow ONE dedicated connection for the whole transaction
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const quizResult = await client.query(
        `INSERT INTO quizzes (module_id, title, is_ai_generated)
         VALUES ($1, $2, false)
         RETURNING id`,
        [module_id, title]
      );
      const quizId = quizResult.rows[0].id;

      for (const q of questions) {
        const questionResult = await client.query(
          `INSERT INTO quiz_questions (quiz_id, question_text, question_type, order_index)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [quizId, q.question_text, q.question_type, q.order_index]
        );
        const questionId = questionResult.rows[0].id;

        for (const opt of q.options ?? []) {
          await client.query(
            `INSERT INTO quiz_options (question_id, option_text, is_correct)
             VALUES ($1, $2, $3)`,
            [questionId, opt.option_text, opt.is_correct ?? false]
          );
        }
      }

      await client.query("COMMIT");
      res.status(201).json({ quiz_id: quizId });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      res.status(500).json({ error: "SERVER_ERROR" });
    } finally {
      client.release();
    }
  }
);

export default router;