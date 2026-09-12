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
// GET /quizzes/:id
// Returns quiz questions + options (WITHOUT is_correct — never leak answers).
// Instructor/admin who owns it can view anytime; students must be enrolled.
// ---------------------------------------------------------------------------
router.get("/quizzes/:id", authenticate, async (req: any, res) => {
  const quizId = req.params.id;
  const userId = req.user.userId;
  const role = req.user.role;

  try {
    const quizResult = await pool.query(
      `SELECT q.id, q.title, q.module_id, c.id AS course_id, c.instructor_id
       FROM quizzes q
       JOIN modules m ON m.id = q.module_id
       JOIN courses c ON c.id = m.course_id
       WHERE q.id = $1`,
      [quizId],
    );
    const quiz = quizResult.rows[0];

    if (!quiz) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Quiz not found" } });
    }

    const isOwner = quiz.instructor_id === userId;
    const isAdmin = role === "admin";

    if (!isOwner && !isAdmin) {
      const enrollmentResult = await pool.query(
        `SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2`,
        [userId, quiz.course_id],
      );
      if (enrollmentResult.rows.length === 0) {
        return res.status(403).json({
          error: {
            code: "NOT_ENROLLED",
            message: "You must be enrolled in this course to view this quiz",
          },
        });
      }
    }

    const questionsResult = await pool.query(
      `SELECT id, question_text, question_type, order_index
       FROM quiz_questions
       WHERE quiz_id = $1
       ORDER BY order_index`,
      [quizId],
    );

    const optionsResult = await pool.query(
      `SELECT qo.id, qo.question_id, qo.option_text
       FROM quiz_options qo
       JOIN quiz_questions qq ON qq.id = qo.question_id
       WHERE qq.quiz_id = $1
       ORDER BY qo.id`,
      [quizId],
    );

    const questions = questionsResult.rows.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      order_index: q.order_index,
      options: optionsResult.rows
        .filter((o) => o.question_id === q.id)
        .map((o) => ({ id: o.id, option_text: o.option_text })),
    }));

    res.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        module_id: quiz.module_id,
        questions,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

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
        `SELECT id, quiz_id, submitted_at FROM quiz_attempts WHERE id = $1 AND user_id = $2`,
        [attemptId, userId],
      );
      if (attemptResult.rows.length === 0) {
        return res.status(403).json({ error: "NOT_YOUR_ATTEMPT" });
      }

      // 1b. Block resubmission of an already-graded attempt — retakes go
      // through a NEW attempt (POST /quizzes/:id/attempt), not this one again.
      if (attemptResult.rows[0].submitted_at !== null) {
        return res.status(409).json({
          error: {
            code: "ALREADY_SUBMITTED",
            message: "This attempt has already been submitted",
          },
        });
      }

      // 2. Pull the FULL, authoritative list of this quiz's questions from
      // the database — not just whatever the student happened to answer.
      // This is what lets us catch skipped questions as wrong, not ignored.
      const allQuestionsResult = await pool.query(
        `SELECT id, question_type FROM quiz_questions WHERE quiz_id = $1`,
        [attemptResult.rows[0].quiz_id],
      );
      const questionTypeById = new Map(
        allQuestionsResult.rows.map((q) => [q.id, q.question_type]),
      );

      // Validate up front: every submitted answer must belong to this quiz.
      for (const answer of answers) {
        if (!questionTypeById.has(answer.question_id)) {
          return res.status(400).json({
            error: {
              code: "INVALID_QUESTION",
              message: "This question does not belong to this quiz",
            },
          });
        }
      }

      // A quick lookup of what the student actually submitted, by question_id.
      const submittedByQuestionId = new Map<string, any>(
        answers.map((a: any) => [a.question_id, a]),
      );

      let correctCount = 0;
      let gradableCount = 0; // only mcq/multi_select count toward the score

      for (const [questionId, questionType] of questionTypeById) {
        const answer = submittedByQuestionId.get(questionId); // undefined = skipped

        let isCorrect: boolean | null = null;

        if (questionType === "mcq" || questionType === "multi_select") {
          gradableCount++;

          const correctOptionsResult = await pool.query(
            `SELECT id FROM quiz_options WHERE question_id = $1 AND is_correct = true`,
            [questionId],
          );
          const correctIds = correctOptionsResult.rows.map((r) => r.id).sort();
          const selectedIds = (answer?.selected_option_ids ?? [])
            .slice()
            .sort();

          // Exact match: same length AND every ID matches at the same position.
          // A skipped question has zero selectedIds, so it correctly comes
          // out as wrong unless correctIds is also empty (which shouldn't happen).
          isCorrect =
            correctIds.length === selectedIds.length &&
            correctIds.every((id: string, i: number) => id === selectedIds[i]);

          if (isCorrect) correctCount++;
        }
        // short_answer: isCorrect stays null — not auto-graded, answered or not

        await pool.query(
          `INSERT INTO quiz_answers (attempt_id, question_id, selected_option_ids, text_answer, is_correct)
         VALUES ($1, $2, $3, $4, $5)`,
          [
            attemptId,
            questionId,
            answer?.selected_option_ids ?? null,
            answer?.text_answer ?? null,
            isCorrect,
          ],
        );
      }

      // 3. Score = percentage of GRADABLE questions answered correctly.
      // null (not 0) when there are no gradable questions — a pure
      // short_answer quiz hasn't been graded, it isn't a 0% fail.
      const score =
        gradableCount > 0 ? (correctCount / gradableCount) * 100 : null;

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
