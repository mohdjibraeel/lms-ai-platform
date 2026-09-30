import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate } from "../../middleware/auth.middleware";
import { notifyMany } from "../../utils/notifications";

const router = Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 5000;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

// ---------------------------------------------------------------------------
// Shared permission check: who may read/post in a course's discussion forum?
// Same rule as announcements: the course's own instructor, any admin, or a
// student enrolled in that course. Returns null (allowed) or an {status,
// body} pair to send straight back (not found / forbidden).
// ---------------------------------------------------------------------------
async function checkCourseAccess(
  courseId: string,
  userId: string,
  role: string,
): Promise<{ status: number; body: any } | null> {
  const courseResult = await pool.query(
    "SELECT id, instructor_id FROM courses WHERE id = $1",
    [courseId],
  );
  const course = courseResult.rows[0];

  if (!course) {
    return {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Course not found" } },
    };
  }

  const isOwner = course.instructor_id === userId;
  const isAdmin = role === "admin";

  if (isOwner || isAdmin) return null;

  const enrollmentCheck = await pool.query(
    "SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2",
    [userId, courseId],
  );
  if (enrollmentCheck.rows.length > 0) return null;

  return {
    status: 403,
    body: {
      error: {
        code: "NOT_ENROLLED",
        message:
          "You must be enrolled in this course to use its discussion forum",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// POST /courses/:id/threads
// Start a new discussion thread with its opening message, in one request.
// A thread is never created without at least one post — the title alone
// would be a conversation with nothing said yet.
// ---------------------------------------------------------------------------
router.post("/courses/:id/threads", authenticate, async (req, res) => {
  const courseId = req.params.id as string;
  const userId = req.user!.userId;
  const role = req.user!.role;

  if (!isValidUuid(courseId)) {
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

  const accessError = await checkCourseAccess(courseId, userId, role);
  if (accessError) return res.status(accessError.status).json(accessError.body);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const threadResult = await client.query(
      `INSERT INTO discussion_threads (course_id, created_by, title)
       VALUES ($1, $2, $3)
       RETURNING id, course_id, created_by, title, created_at`,
      [courseId, userId, title.trim()],
    );
    const thread = threadResult.rows[0];

    const postResult = await client.query(
      `INSERT INTO discussion_posts (thread_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, thread_id, user_id, content, is_flagged, created_at`,
      [thread.id, userId, content.trim()],
    );

    await client.query("COMMIT");
    res.status(201).json({ thread, opening_post: postResult.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to create discussion thread:", err);
    res.status(500).json({
      error: {
        code: "SERVER_ERROR",
        message: "Something went wrong on our side",
      },
    });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// GET /courses/:id/threads
// List a course's threads, newest first, with a reply count so the student
// can see which conversations are active without opening each one.
// ---------------------------------------------------------------------------
router.get("/courses/:id/threads", authenticate, async (req, res) => {
  const courseId = req.params.id as string;
  const userId = req.user!.userId;
  const role = req.user!.role;

  if (!isValidUuid(courseId)) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "id must be a valid UUID" },
    });
  }

  const accessError = await checkCourseAccess(courseId, userId, role);
  if (accessError) return res.status(accessError.status).json(accessError.body);

  const result = await pool.query(
    `SELECT t.id, t.title, t.created_at, u.full_name AS created_by_name,
            COUNT(p.id)::int AS post_count
     FROM discussion_threads t
     LEFT JOIN users u ON u.id = t.created_by
     LEFT JOIN discussion_posts p ON p.thread_id = t.id
     WHERE t.course_id = $1
     GROUP BY t.id, u.full_name
     ORDER BY t.created_at DESC
     LIMIT 50`,
    [courseId],
  );

  res.json({ threads: result.rows });
});

// ---------------------------------------------------------------------------
// GET /threads/:id
// One thread, plus every post inside it, oldest first (so it reads top to
// bottom like a real conversation).
// ---------------------------------------------------------------------------
router.get("/threads/:id", authenticate, async (req, res) => {
  const threadId = req.params.id as string;
  const userId = req.user!.userId;
  const role = req.user!.role;

  if (!isValidUuid(threadId)) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "id must be a valid UUID" },
    });
  }

  const threadResult = await pool.query(
    `SELECT t.id, t.course_id, t.title, t.created_at, u.full_name AS created_by_name
     FROM discussion_threads t
     LEFT JOIN users u ON u.id = t.created_by
     WHERE t.id = $1`,
    [threadId],
  );
  const thread = threadResult.rows[0];

  if (!thread) {
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Thread not found" } });
  }

  const accessError = await checkCourseAccess(thread.course_id, userId, role);
  if (accessError) return res.status(accessError.status).json(accessError.body);

  const postsResult = await pool.query(
    `SELECT p.id, p.user_id, u.full_name AS user_name, p.content, p.is_flagged, p.created_at
     FROM discussion_posts p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.thread_id = $1
     ORDER BY p.created_at ASC`,
    [threadId],
  );

  res.json({ thread, posts: postsResult.rows });
});

// ---------------------------------------------------------------------------
// POST /threads/:id/posts
// Reply to an existing thread. Everyone who has posted in the thread before
// (excluding whoever is replying right now) gets a bell notification.
// ---------------------------------------------------------------------------
router.post("/threads/:id/posts", authenticate, async (req, res) => {
  const threadId = req.params.id as string;
  const userId = req.user!.userId;
  const role = req.user!.role;

  if (!isValidUuid(threadId)) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "id must be a valid UUID" },
    });
  }

  const { content } = req.body ?? {};

  if (typeof content !== "string" || content.trim() === "") {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "content is required" },
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

  const threadResult = await pool.query(
    `SELECT t.id, t.course_id, t.title FROM discussion_threads t WHERE t.id = $1`,
    [threadId],
  );
  const thread = threadResult.rows[0];

  if (!thread) {
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Thread not found" } });
  }

  const accessError = await checkCourseAccess(thread.course_id, userId, role);
  if (accessError) return res.status(accessError.status).json(accessError.body);

  const insertResult = await pool.query(
    `INSERT INTO discussion_posts (thread_id, user_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, thread_id, user_id, content, is_flagged, created_at`,
    [threadId, userId, content.trim()],
  );

  // Notify everyone who has already spoken in this thread, except the person
  // replying right now. DISTINCT means someone with several earlier posts
  // (or the thread's opener) is only notified once per reply, not per post.
  const participantsResult = await pool.query(
    `SELECT DISTINCT user_id FROM discussion_posts WHERE thread_id = $1 AND user_id <> $2`,
    [threadId, userId],
  );
  const participantIds: string[] = participantsResult.rows.map(
    (r) => r.user_id,
  );

  await notifyMany(
    participantIds,
    `New reply: ${thread.title}`,
    content.trim().length > 200
      ? content.trim().slice(0, 200) + "…"
      : content.trim(),
    `/threads/${threadId}`,
  );

  res.status(201).json({ post: insertResult.rows[0] });
});

// ---------------------------------------------------------------------------
// PUT /posts/:id/flag
// Report a post as inappropriate. Anyone with access to the course this
// post's thread belongs to can flag it (any enrolled student, the owner, or
// an admin) — flagging is a "please review this" signal, not a moderation
// action itself. Actually removing a post happens on the admin side later.
// ---------------------------------------------------------------------------
router.put("/posts/:id/flag", authenticate, async (req, res) => {
  const postId = req.params.id as string;
  const userId = req.user!.userId;
  const role = req.user!.role;

  if (!isValidUuid(postId)) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "id must be a valid UUID" },
    });
  }

  const postResult = await pool.query(
    `SELECT p.id, p.user_id, t.course_id
     FROM discussion_posts p
     JOIN discussion_threads t ON t.id = p.thread_id
     WHERE p.id = $1`,
    [postId],
  );
  const post = postResult.rows[0];

  if (!post) {
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Post not found" } });
  }

  if (post.user_id === userId) {
    return res.status(403).json({
      error: {
        code: "CANNOT_FLAG_OWN_POST",
        message: "You cannot flag your own post",
      },
    });
  }

  const accessError = await checkCourseAccess(post.course_id, userId, role);
  if (accessError) return res.status(accessError.status).json(accessError.body);

  const updateResult = await pool.query(
    `UPDATE discussion_posts SET is_flagged = TRUE WHERE id = $1
     RETURNING id, thread_id, user_id, content, is_flagged, created_at`,
    [postId],
  );

  res.json({ post: updateResult.rows[0] });
});

export default router;
