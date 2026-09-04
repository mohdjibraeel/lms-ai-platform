import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate, requireRole } from "../../middleware/auth.middleware";
import { uploadAssignment } from "../../middleware/upload.middleware";
import { uploadFileToMinio, deleteFileFromMinio } from "../../storage/minioClient";

const router = Router();

// ---------------------------------------------------------------------------
// POST /assignments/:id/submit
// Multipart form, field name "file". Requires enrollment in the assignment's
// course. Resubmission replaces the old file (in MinIO and in the DB row).
// ---------------------------------------------------------------------------
router.post(
  "/assignments/:id/submit",
  authenticate,
  requireRole("student"),
  uploadAssignment.single("file"),
  async (req: any, res) => {
    const assignmentId = req.params.id;
    const userId = req.user.userId;

    if (!req.file) {
      return res.status(400).json({ error: "FILE_REQUIRED" });
    }

    try {
      // 1. Confirm the assignment exists, get its course + due date, and
      //    confirm this student is enrolled in that course.
      const assignmentResult = await pool.query(
        `SELECT a.id, a.due_date, e.id AS enrollment_id
         FROM assignments a
         JOIN courses c ON a.course_id = c.id
         JOIN enrollments e ON e.course_id = c.id AND e.user_id = $1
         WHERE a.id = $2`,
        [userId, assignmentId]
      );

      if (assignmentResult.rows.length === 0) {
        return res.status(403).json({ error: "NOT_ENROLLED" });
      }

      const { due_date } = assignmentResult.rows[0];

      // 2. Reject late submissions (FR-S6: "before a deadline") — inference,
      // flagged since the API table doesn't spell this check out explicitly.
      if (due_date && new Date() > new Date(due_date)) {
        return res.status(400).json({ error: "PAST_DUE" });
      }

      // 3. If a previous submission exists, delete its file from MinIO
      //    before uploading the new one — per your resubmission decision.
      const existingResult = await pool.query(
        `SELECT file_url FROM assignment_submissions
         WHERE assignment_id = $1 AND user_id = $2`,
        [assignmentId, userId]
      );

      if (existingResult.rows.length > 0) {
        await deleteFileFromMinio(existingResult.rows[0].file_url);
      }

      // 4. Upload the new file — same sanitization pattern as lecture uploads.
      const safeName = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const key = `assignments/${assignmentId}/${userId}/${Date.now()}-${safeName}`;
      await uploadFileToMinio(req.file.buffer, key, req.file.mimetype);

      // 5. Upsert the submission row. Resubmitting resets grade/feedback to
      // NULL — a new file means the old grade no longer applies.
      const result = await pool.query(
        `INSERT INTO assignment_submissions (assignment_id, user_id, file_url, submitted_at, grade, feedback)
         VALUES ($1, $2, $3, now(), NULL, NULL)
         ON CONFLICT (assignment_id, user_id)
         DO UPDATE SET
           file_url = EXCLUDED.file_url,
           submitted_at = now(),
           grade = NULL,
           feedback = NULL
         RETURNING id, assignment_id, user_id, file_url, submitted_at, grade, feedback`,
        [assignmentId, userId, key]
      );

      res.status(201).json({ submission: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  }
);

export default router;