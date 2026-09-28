import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate, requireRole } from "../../middleware/auth.middleware";
import { notifyMany } from "../../utils/notifications";

const router = Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_TITLE_LENGTH = 150;
const MAX_CONTENT_LENGTH = 5000;
const NOTIFICATION_TITLE_MAX = 150; // notifications.title is VARCHAR(150)
const NOTIFICATION_PREVIEW_MAX = 200;

// Shortens text to at most `max` characters, adding "…" when it had to cut.
function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max - 1).join("") + "…";
}

// ---------------------------------------------------------------------------
// POST /courses/:id/announcements   (FR-I6)
// The course's instructor (or an admin) posts an announcement. Every student
// enrolled in the course also gets a bell notification pointing at the course.
// ---------------------------------------------------------------------------
router.post(
  "/courses/:id/announcements",
  authenticate,
  requireRole("instructor", "admin"),
  async (req, res) => {
    const courseId = req.params.id as string;

    if (!UUID_REGEX.test(courseId)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "id must be a valid UUID" },
      });
    }

    const { title, content } = req.body ?? {};

    if (typeof title !== "string" || title.trim() === "") {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "title is required" },
      });
    }
    if (typeof content !== "string" || content.trim() === "") {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "content is required" },
      });
    }
    if (title.trim().length > MAX_TITLE_LENGTH) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `title must be at most ${MAX_TITLE_LENGTH} characters`,
        },
      });
    }
    if (content.trim().length > MAX_CONTENT_LENGTH) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `content must be at most ${MAX_CONTENT_LENGTH} characters`,
        },
      });
    }

    const courseResult = await pool.query(
      "SELECT id, title, instructor_id FROM courses WHERE id = $1",
      [courseId],
    );
    const course = courseResult.rows[0];

    if (!course) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Course not found" } });
    }

    const isOwner = course.instructor_id === req.user!.userId;
    const isAdmin = req.user!.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        error: {
          code: "NOT_COURSE_OWNER",
          message: "You do not own this course",
        },
      });
    }

    const cleanTitle = title.trim();
    const cleanContent = content.trim();

    const insertResult = await pool.query(
      `INSERT INTO announcements (course_id, posted_by, title, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, course_id, posted_by, title, content, created_at`,
      [courseId, req.user!.userId, cleanTitle, cleanContent],
    );

    // Ring the bell of every enrolled student (except the poster, in case an
    // admin who is also enrolled posts it). notifyMany never throws, so a
    // notification problem can never undo or fail the announcement itself.
    const enrolledResult = await pool.query(
      "SELECT user_id FROM enrollments WHERE course_id = $1 AND user_id <> $2",
      [courseId, req.user!.userId],
    );
    const studentIds: string[] = enrolledResult.rows.map((r) => r.user_id);

    await notifyMany(
      studentIds,
      truncate(`New announcement: ${cleanTitle}`, NOTIFICATION_TITLE_MAX),
      `${course.title}: ${truncate(cleanContent, NOTIFICATION_PREVIEW_MAX)}`,
      `/courses/${courseId}`,
    );

    res.status(201).json({ announcement: insertResult.rows[0] });
  },
);

// ---------------------------------------------------------------------------
// GET /courses/:id/announcements
// Latest 50 announcements for a course, newest first. Allowed for the
// course's owner, admins, and students enrolled in that course.
// ---------------------------------------------------------------------------
router.get("/courses/:id/announcements", authenticate, async (req, res) => {
  const courseId = req.params.id as string;
  const userId = req.user!.userId;

  if (!UUID_REGEX.test(courseId)) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "id must be a valid UUID" },
    });
  }

  const courseResult = await pool.query(
    "SELECT id, instructor_id FROM courses WHERE id = $1",
    [courseId],
  );
  const course = courseResult.rows[0];

  if (!course) {
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Course not found" } });
  }

  const isOwner = course.instructor_id === userId;
  const isAdmin = req.user!.role === "admin";

  if (!isOwner && !isAdmin) {
    const enrollmentCheck = await pool.query(
      "SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2",
      [userId, courseId],
    );
    if (enrollmentCheck.rows.length === 0) {
      return res.status(403).json({
        error: {
          code: "NOT_ENROLLED",
          message:
            "You must be enrolled in this course to view its announcements",
        },
      });
    }
  }

  const result = await pool.query(
    `SELECT a.id, a.title, a.content, a.created_at,
            u.full_name AS posted_by_name
     FROM announcements a
     LEFT JOIN users u ON u.id = a.posted_by
     WHERE a.course_id = $1
     ORDER BY a.created_at DESC
     LIMIT 50`,
    [courseId],
  );

  res.json({ announcements: result.rows });
});

export default router;