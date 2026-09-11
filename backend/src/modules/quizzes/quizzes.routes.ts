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
      [module_id],
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
        [module_id, title],
      );
      const quizId = quizResult.rows[0].id;

      for (const q of questions) {
        const questionResult = await client.query(
          `INSERT INTO quiz_questions (quiz_id, question_text, question_type, order_index)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [quizId, q.question_text, q.question_type, q.order_index],
        );
        const questionId = questionResult.rows[0].id;

        for (const opt of q.options ?? []) {
          await client.query(
            `INSERT INTO quiz_options (question_id, option_text, is_correct)
             VALUES ($1, $2, $3)`,
            [questionId, opt.option_text, opt.is_correct ?? false],
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
  },
);

// ---------------------------------------------------------------------------
// POST /quizzes/:id/attempt
// Creates a new attempt row for this student on this quiz. Multiple attempts
// per student are allowed (no unique constraint on quiz_attempts).
// ---------------------------------------------------------------------------
router.post(
  "/quizzes/:id/attempt",
  authenticate,
  requireRole("student"),
  async (req: any, res) => {
    const quizId = req.params.id;
    const userId = req.user.userId;

    try {
      // Enrollment check — same JOIN-chain pattern as progress/submissions
      const enrollmentResult = await pool.query(
        `SELECT e.id
         FROM quizzes q
         JOIN modules m ON q.module_id = m.id
         JOIN courses c ON m.course_id = c.id
         JOIN enrollments e ON e.course_id = c.id AND e.user_id = $1
         WHERE q.id = $2`,
        [userId, quizId],
      );

      if (enrollmentResult.rows.length === 0) {
        return res.status(403).json({ error: "NOT_ENROLLED" });
      }

      const result = await pool.query(
        `INSERT INTO quiz_attempts (quiz_id, user_id, started_at)
         VALUES ($1, $2, now())
         RETURNING id, quiz_id, user_id, started_at`,
        [quizId, userId],
      );

      res.status(201).json({ attempt: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  },
);
// ---------------------------------------------------------------------------
// POST /attempts/:id/submit
// Body: { answers: [{ question_id, selected_option_ids?, text_answer? }] }
// Grades MCQ/multi_select automatically. Leaves short_answer ungraded.
// ---------------------------------------------------------------------------
router.post(
  "/attempts/:id/submit",
  authenticate,
  requireRole("student"),
  async (req: any, res) => {
    const attemptId = req.params.id;
    const userId = req.user.userId;
    const { answers } = req.body;

    try {
      // 1. Confirm this attempt belongs to this student (not someone else's attempt)
      const attemptResult = await pool.query(
        `SELECT id, quiz_id FROM quiz_attempts WHERE id = $1 AND user_id = $2`,
        [attemptId, userId],
      );
      if (attemptResult.rows.length === 0) {
        return res.status(403).json({ error: "NOT_YOUR_ATTEMPT" });
      }

      let correctCount = 0;
      let gradableCount = 0; // only mcq/multi_select count toward the score

      for (const answer of answers) {
        // 2. Look up this question's type and its correct option IDs
        const questionResult = await pool.query(
          `SELECT question_type FROM quiz_questions WHERE id = $1`,
          [answer.question_id],
        );
        const questionType = questionResult.rows[0].question_type;

        let isCorrect: boolean | null = null;

        if (questionType === "mcq" || questionType === "multi_select") {
          gradableCount++;

          const correctOptionsResult = await pool.query(
            `SELECT id FROM quiz_options WHERE question_id = $1 AND is_correct = true`,
            [answer.question_id],
          );
          const correctIds = correctOptionsResult.rows.map((r) => r.id).sort();
          const selectedIds = (answer.selected_option_ids ?? []).slice().sort();

          // Exact match: same length AND every ID matches at the same position
          isCorrect =
            correctIds.length === selectedIds.length &&
            correctIds.every((id, i) => id === selectedIds[i]);

          if (isCorrect) correctCount++;
        }
        // short_answer: isCorrect stays null — not auto-graded

        await pool.query(
          `INSERT INTO quiz_answers (attempt_id, question_id, selected_option_ids, text_answer, is_correct)
         VALUES ($1, $2, $3, $4, $5)`,
          [
            attemptId,
            answer.question_id,
            answer.selected_option_ids ?? null,
            answer.text_answer ?? null,
            isCorrect,
          ],
        );
      }

      // 3. Score = percentage of GRADABLE questions answered correctly
      const score =
        gradableCount > 0 ? (correctCount / gradableCount) * 100 : 0;

      if (score === 100) {
        await pool.query(
          `INSERT INTO user_badges (user_id, badge_id) VALUES ($1, 3) ON CONFLICT DO NOTHING`,
          [userId],
        );
      }

      const updateResult = await pool.query(
        `UPDATE quiz_attempts SET score = $1, submitted_at = now() WHERE id = $2
       RETURNING id, quiz_id, user_id, score, started_at, submitted_at`,
        [score, attemptId],
      );

      res.json({ attempt: updateResult.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  },
);

export default router;
