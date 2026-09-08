import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate, requireRole } from "../../middleware/auth.middleware";

const router = Router();

// ---------------------------------------------------------------------------
// POST /assignments
// Body: { course_id, title, instructions, rubric, due_date }
// Only the instructor who owns the course can create an assignment for it.
// ---------------------------------------------------------------------------
router.post(
  "/assignments",
  authenticate,
  requireRole("instructor", "admin"),
  async (req: any, res) => {
    const { course_id, title, instructions, rubric, due_date } = req.body;
    const userId = req.user.userId;

    try {
      // Ownership check — same pattern as your existing POST /courses/:id/modules
      const courseResult = await pool.query(
        `SELECT instructor_id FROM courses WHERE id = $1`,
        [course_id],
      );

      if (courseResult.rows.length === 0) {
        return res.status(404).json({ error: "COURSE_NOT_FOUND" });
      }

      const isOwner = courseResult.rows[0].instructor_id === userId;
      const isAdmin = req.user.role === "admin";
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "NOT_COURSE_OWNER" });
      }

      const result = await pool.query(
        `INSERT INTO assignments (course_id, title, instructions, rubric, due_date)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, course_id, title, instructions, rubric, due_date`,
        [course_id, title, instructions, rubric ?? null, due_date ?? null],
      );

      res.status(201).json({ assignment: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  },
);

router.put(
  "/submissions/:id/grade",
  authenticate,
  requireRole("instructor", "admin"),
  async (req: any, res) => {
    const submissionId = req.params.id;
    const userId = req.user.userId;
    const { grade, feedback } = req.body;

    if (grade === undefined || grade === null) {
      return res.status(400).json({ error: "GRADE_REQUIRED" });
    }

    try {
      const ownerResult = await pool.query(
        `SELECT c.instructor_id
         FROM assignment_submissions s
         JOIN assignments a ON s.assignment_id = a.id
         JOIN courses c ON a.course_id = c.id
         WHERE s.id = $1`,
        [submissionId],
      );

      if (ownerResult.rows.length === 0) {
        return res.status(404).json({ error: "SUBMISSION_NOT_FOUND" });
      }

      const isOwner = ownerResult.rows[0].instructor_id === userId;
      const isAdmin = req.user.role === "admin";
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "NOT_COURSE_OWNER" });
      }

      const result = await pool.query(
        `UPDATE assignment_submissions
         SET grade = $1, feedback = $2
         WHERE id = $3
         RETURNING id, assignment_id, user_id, file_url, submitted_at, grade, feedback`,
        [grade, feedback ?? null, submissionId],
      );

      res.json({ submission: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  },
);

export default router;
