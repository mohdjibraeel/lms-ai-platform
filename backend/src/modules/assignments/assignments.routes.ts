import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate, requireRole } from "../../middleware/auth.middleware";
import { getPresignedVideoUrl } from "../../storage/minioClient";

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
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Course not found" } });
      }

      const isOwner = courseResult.rows[0].instructor_id === userId;
      const isAdmin = req.user.role === "admin";
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: { code: "NOT_COURSE_OWNER", message: "You do not own this course" } });
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
      res.status(500).json({ error: { code: "SERVER_ERROR", message: "Something went wrong on our side" } });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /assignments/:id
// Returns assignment details (instructions, rubric, due_date) plus an
// is_past_due flag so the frontend can warn before the student even tries
// to submit. Instructor/admin who owns it can view anytime; students must
// be enrolled in the assignment's course.
// ---------------------------------------------------------------------------
router.get("/assignments/:id", authenticate, async (req: any, res) => {
  const assignmentId = req.params.id;
  const userId = req.user.userId;
  const role = req.user.role;

  try {
    const assignmentResult = await pool.query(
      `SELECT a.id, a.course_id, a.title, a.instructions, a.rubric, a.due_date, c.instructor_id
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       WHERE a.id = $1`,
      [assignmentId],
    );
    const assignment = assignmentResult.rows[0];

    if (!assignment) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Assignment not found" },
      });
    }

    const isOwner = assignment.instructor_id === userId;
    const isAdmin = role === "admin";

    if (!isOwner && !isAdmin) {
      const enrollmentResult = await pool.query(
        `SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2`,
        [userId, assignment.course_id],
      );
      if (enrollmentResult.rows.length === 0) {
        return res.status(403).json({
          error: {
            code: "NOT_ENROLLED",
            message:
              "You must be enrolled in this course to view this assignment",
          },
        });
      }
    }

    const isPastDue =
      assignment.due_date !== null &&
      new Date(assignment.due_date) < new Date();

    res.json({
      assignment: {
        id: assignment.id,
        course_id: assignment.course_id,
        title: assignment.title,
        instructions: assignment.instructions,
        rubric: assignment.rubric,
        due_date: assignment.due_date,
        is_past_due: isPastDue,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Something went wrong on our side" } });
  }
});

// ---------------------------------------------------------------------------
// GET /assignments/:id/submissions
// Instructor/admin only — lists every student's submission for this
// assignment, with a real downloadable link (not just the internal MinIO
// key) so the grading screen can actually let them open the file.
// ---------------------------------------------------------------------------
router.get(
  "/assignments/:id/submissions",
  authenticate,
  requireRole("instructor", "admin"),
  async (req: any, res) => {
    const assignmentId = req.params.id;
    const userId = req.user.userId;

    try {
      const assignmentResult = await pool.query(
        `SELECT a.id, c.instructor_id
         FROM assignments a
         JOIN courses c ON c.id = a.course_id
         WHERE a.id = $1`,
        [assignmentId],
      );
      const assignment = assignmentResult.rows[0];

      if (!assignment) {
        return res
          .status(404)
          .json({
            error: { code: "NOT_FOUND", message: "Assignment not found" },
          });
      }

      const isOwner = assignment.instructor_id === userId;
      const isAdmin = req.user.role === "admin";
      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          error: {
            code: "NOT_COURSE_OWNER",
            message: "You do not own this course",
          },
        });
      }

      const submissionsResult = await pool.query(
        `SELECT s.id, s.user_id, u.full_name, u.email, s.file_url,
                s.submitted_at, s.grade, s.feedback
         FROM assignment_submissions s
         JOIN users u ON u.id = s.user_id
         WHERE s.assignment_id = $1
         ORDER BY s.submitted_at DESC`,
        [assignmentId],
      );

      const submissions = await Promise.all(
        submissionsResult.rows.map(async (row) => ({
          id: row.id,
          user_id: row.user_id,
          full_name: row.full_name,
          email: row.email,
          download_url: await getPresignedVideoUrl(row.file_url),
          submitted_at: row.submitted_at,
          grade: row.grade,
          feedback: row.feedback,
        })),
      );

      res.json({ submissions });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: { code: "SERVER_ERROR", message: "Something went wrong on our side" } });
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
      return res.status(400).json({ error: { code: "GRADE_REQUIRED", message: "A grade is required" } });
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
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Submission not found" } });
      }

      const isOwner = ownerResult.rows[0].instructor_id === userId;
      const isAdmin = req.user.role === "admin";
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: { code: "NOT_COURSE_OWNER", message: "You do not own this course" } });
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
      res.status(500).json({ error: { code: "SERVER_ERROR", message: "Something went wrong on our side" } });
    }
  },
);

export default router;
