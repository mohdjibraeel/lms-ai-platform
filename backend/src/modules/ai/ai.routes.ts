import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Small shared helper: forward a request to the Python ai-service, and pass
// its response (success or error) straight back to our own caller, so the
// PRD-compliant { error: { code, message } } shape from ai-service survives
// the hop through Node unchanged.
// ---------------------------------------------------------------------------
async function forwardToAiService(
  path: string,
  method: "GET" | "POST" | "PUT",
  body: unknown,
  res: import("express").Response,
) {
  try {
    const aiResponse = await fetch(`${AI_SERVICE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await aiResponse.json();
    res.status(aiResponse.status).json(data);
  } catch (err) {
    res.status(503).json({
      error: {
        code: "AI_SERVICE_UNREACHABLE",
        message: "Could not reach the AI service, please try again shortly",
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Shared check: is this user allowed to use the AI Tutor for this course?
// Students must be enrolled; instructors must own the course; admins never
// (matches the PRD's role table — Decision #5).
// ---------------------------------------------------------------------------
async function canAccessCourseAi(
  userId: string,
  role: string,
  courseId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  if (role === "admin") {
    return { allowed: false, reason: "Admins do not use the AI Tutor" };
  }

  const courseResult = await pool.query(
    "SELECT instructor_id FROM courses WHERE id = $1",
    [courseId],
  );
  const course = courseResult.rows[0];
  if (!course) {
    return { allowed: false, reason: "Course not found" };
  }

  if (role === "instructor") {
    return course.instructor_id === userId
      ? { allowed: true }
      : { allowed: false, reason: "You do not own this course" };
  }

  // student
  const enrollment = await pool.query(
    "SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2",
    [userId, courseId],
  );
  return enrollment.rows.length > 0
    ? { allowed: true }
    : { allowed: false, reason: "You must be enrolled in this course" };
}

// ---------------------------------------------------------------------------
// POST /ai/chat/sessions
// ---------------------------------------------------------------------------
router.post("/ai/chat/sessions", authenticate, async (req, res) => {
  const { course_id } = req.body;
  const user_id = req.user!.userId;
  const role = req.user!.role;

  if (!course_id) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "course_id is required", field: "course_id" },
    });
  }

  const access = await canAccessCourseAi(user_id, role, course_id);
  if (!access.allowed) {
    return res.status(403).json({
      error: { code: "AI_ACCESS_DENIED", message: access.reason },
    });
  }

  await forwardToAiService("/ai/chat/sessions", "POST", { user_id, course_id }, res);
});

// ---------------------------------------------------------------------------
// Shared: fetch a chat session and confirm this user owns it, since the
// message/mode routes only get a session_id, not a course_id, in the URL.
// ---------------------------------------------------------------------------
async function getOwnedSessionOr403(
  sessionId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
  const result = await pool.query(
    "SELECT user_id FROM ai_chat_sessions WHERE id = $1",
    [sessionId],
  );
  const session = result.rows[0];
  if (!session) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Session not found" };
  }
  if (session.user_id !== userId) {
    return { ok: false, status: 403, code: "AI_ACCESS_DENIED", message: "This is not your chat session" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// POST /ai/chat/sessions/:id/messages
// ---------------------------------------------------------------------------
router.post("/ai/chat/sessions/:id/messages", authenticate, async (req, res) => {
  const sessionId = req.params.id as string;
  const userId = req.user!.userId;
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "message is required", field: "message" },
    });
  }

  const ownership = await getOwnedSessionOr403(sessionId, userId);
  if (!ownership.ok) {
    return res
      .status(ownership.status)
      .json({ error: { code: ownership.code, message: ownership.message } });
  }

  await forwardToAiService(
    `/ai/chat/sessions/${sessionId}/messages`,
    "POST",
    { message },
    res,
  );
});

// ---------------------------------------------------------------------------
// PUT /ai/chat/sessions/:id/mode
// ---------------------------------------------------------------------------
router.put("/ai/chat/sessions/:id/mode", authenticate, async (req, res) => {
  const sessionId = req.params.id as string;
  const userId = req.user!.userId;
  const { mode } = req.body;

  const ownership = await getOwnedSessionOr403(sessionId, userId);
  if (!ownership.ok) {
    return res
      .status(ownership.status)
      .json({ error: { code: ownership.code, message: ownership.message } });
  }

  await forwardToAiService(`/ai/chat/sessions/${sessionId}/mode`, "PUT", { mode }, res);
});

// ---------------------------------------------------------------------------
// POST /ai/lectures/:id/summarize
// ---------------------------------------------------------------------------
router.post("/ai/lectures/:id/summarize", authenticate, async (req, res) => {
  const lectureId = req.params.id;
  const userId = req.user!.userId;
  const role = req.user!.role;

  const lectureResult = await pool.query(
    `SELECT c.id AS course_id
     FROM lectures l
     JOIN modules m ON m.id = l.module_id
     JOIN courses c ON c.id = m.course_id
     WHERE l.id = $1`,
    [lectureId],
  );
  const lecture = lectureResult.rows[0];
  if (!lecture) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Lecture not found" } });
  }

  const access = await canAccessCourseAi(userId, role, lecture.course_id);
  if (!access.allowed) {
    return res.status(403).json({ error: { code: "AI_ACCESS_DENIED", message: access.reason } });
  }

  await forwardToAiService(`/ai/lectures/${lectureId}/summarize`, "POST", null, res);
});

// ---------------------------------------------------------------------------
// POST /ai/lectures/:id/generate-quiz — instructor/admin only (PRD: "for
// instructor review"), so students can't trigger quiz generation themselves.
// ---------------------------------------------------------------------------
router.post("/ai/lectures/:id/generate-quiz", authenticate, async (req, res) => {
  const lectureId = req.params.id;
  const userId = req.user!.userId;
  const role = req.user!.role;

  if (role !== "instructor" && role !== "admin") {
    return res.status(403).json({
      error: { code: "FORBIDDEN", message: "Requires role: instructor or admin" },
    });
  }

  const lectureResult = await pool.query(
    `SELECT c.instructor_id
     FROM lectures l
     JOIN modules m ON m.id = l.module_id
     JOIN courses c ON c.id = m.course_id
     WHERE l.id = $1`,
    [lectureId],
  );
  const lecture = lectureResult.rows[0];
  if (!lecture) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Lecture not found" } });
  }

  if (role !== "admin" && lecture.instructor_id !== userId) {
    return res.status(403).json({
      error: { code: "NOT_COURSE_OWNER", message: "You do not own this course" },
    });
  }

  await forwardToAiService(`/ai/lectures/${lectureId}/generate-quiz`, "POST", null, res);
});

// ---------------------------------------------------------------------------
// POST /ai/modules/:id/flashcards
// ---------------------------------------------------------------------------
router.post("/ai/modules/:id/flashcards", authenticate, async (req, res) => {
  const moduleId = req.params.id;
  const userId = req.user!.userId;
  const role = req.user!.role;

  const moduleResult = await pool.query(
    `SELECT c.id AS course_id
     FROM modules m
     JOIN courses c ON c.id = m.course_id
     WHERE m.id = $1`,
    [moduleId],
  );
  const moduleRow = moduleResult.rows[0];
  if (!moduleRow) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Module not found" } });
  }

  const access = await canAccessCourseAi(userId, role, moduleRow.course_id);
  if (!access.allowed) {
    return res.status(403).json({ error: { code: "AI_ACCESS_DENIED", message: access.reason } });
  }

  await forwardToAiService(`/ai/modules/${moduleId}/flashcards`, "POST", null, res);
});

// ---------------------------------------------------------------------------
// POST /ai/study-plan — always for the logged-in student themselves; any
// course_id sent in the body is ignored, user_id always comes from the JWT.
// ---------------------------------------------------------------------------
router.post("/ai/study-plan", authenticate, async (req, res) => {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const { course_id } = req.body;

  if (role !== "student") {
    return res.status(403).json({
      error: { code: "FORBIDDEN", message: "Only students have a study plan" },
    });
  }

  if (!course_id) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "course_id is required", field: "course_id" },
    });
  }

  const access = await canAccessCourseAi(userId, role, course_id);
  if (!access.allowed) {
    return res.status(403).json({ error: { code: "AI_ACCESS_DENIED", message: access.reason } });
  }

  await forwardToAiService("/ai/study-plan", "POST", { user_id: userId, course_id }, res);
});

export default router;