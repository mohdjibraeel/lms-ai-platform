import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate, requireRole } from "../../middleware/auth.middleware";
import {
  getPresignedVideoUrl,
  uploadFileToMinio,
} from "../../storage/minioClient";
import { upload } from "../../middleware/upload.middleware";

const router = Router();

router.post(
  "/",
  authenticate,
  requireRole("instructor", "admin"),
  async (req, res) => {
    const { title, description, category, difficulty, thumbnail_url, price } =
      req.body;

    if (!title) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "title is required" },
      });
    }

    const instructor_id = req.user!.userId;
    const finalPrice = price ?? 0;

    const result = await pool.query(
      `INSERT INTO courses (instructor_id, title, description, category, difficulty, thumbnail_url, price)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, instructor_id, title, description, category, difficulty, thumbnail_url, price, status, created_at`,
      [
        instructor_id,
        title,
        description,
        category,
        difficulty,
        thumbnail_url,
        finalPrice,
      ],
    );

    res.status(201).json({ course: result.rows[0] });
  },
);

router.get("/", async (req, res) => {
  const { category, difficulty, q, page } = req.query;

  const conditions: string[] = [`status != 'archived'`];
  const params: any[] = [];

  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  if (difficulty) {
    params.push(difficulty);
    conditions.push(`difficulty = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    conditions.push(`title ILIKE $${params.length}`);
  }

  const whereClause = conditions.join(" AND ");

  const pageNum = Math.max(parseInt(page as string) || 1, 1);
  const limit = 10;
  const offset = (pageNum - 1) * limit;

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM courses WHERE ${whereClause}`,
    params,
  );
  const totalCount = parseInt(countResult.rows[0].count);

  params.push(limit, offset);
  const result = await pool.query(
    `SELECT id, instructor_id, title, description, category, difficulty, thumbnail_url, price, status, created_at
     FROM courses
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  res.json({
    courses: result.rows,
    pagination: {
      page: pageNum,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  });
});

// ---------------------------------------------------------------------------
// GET /mine
// Returns ALL courses owned by the current instructor/admin, regardless of
// status (pending, approved, archived) — unlike the public GET / above,
// which only shows approved-and-not-archived courses to everyone.
// MUST stay before GET /:id, or Express would treat "mine" as a course ID.
// ---------------------------------------------------------------------------
router.get(
  "/mine",
  authenticate,
  requireRole("instructor", "admin"),
  async (req, res) => {
    const instructorId = req.user!.userId;

    const result = await pool.query(
      `SELECT id, title, description, category, difficulty, status, created_at
       FROM courses
       WHERE instructor_id = $1
       ORDER BY created_at DESC`,
      [instructorId],
    );

    res.json({ courses: result.rows });
  },
);

router.post(
  "/:id/enroll",
  authenticate,
  requireRole("student"),
  async (req, res) => {
    const course_id = req.params.id;
    const user_id = req.user!.userId;

    const courseResult = await pool.query(
      "SELECT id, status FROM courses WHERE id = $1",
      [course_id],
    );
    const course = courseResult.rows[0];

    if (!course) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Course not found" } });
    }

    if (course.status !== "approved") {
      return res.status(400).json({
        error: {
          code: "COURSE_NOT_APPROVED",
          message: "This course is not open for enrollment yet",
        },
      });
    }

    try {
      const result = await pool.query(
        `INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2)
       RETURNING id, user_id, course_id, enrolled_at, progress_percent`,
        [user_id, course_id],
      );
      res.status(201).json({ enrollment: result.rows[0] });
    } catch (err: any) {
      if (err.code === "23505") {
        return res.status(409).json({
          error: {
            code: "ALREADY_ENROLLED",
            message: "You are already enrolled in this course",
          },
        });
      }
      throw err;
    }
  },
);

router.post(
  "/:id/modules",
  authenticate,
  requireRole("instructor", "admin"),
  async (req, res) => {
    const course_id = req.params.id;
    const { title, order_index } = req.body;

    if (!title || order_index === undefined) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "title and order_index are required",
        },
      });
    }

    const courseResult = await pool.query(
      "SELECT id, instructor_id FROM courses WHERE id = $1",
      [course_id],
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

    const result = await pool.query(
      `INSERT INTO modules (course_id, title, order_index) VALUES ($1, $2, $3)
     RETURNING id, course_id, title, order_index`,
      [course_id, title, order_index],
    );

    res.status(201).json({ module: result.rows[0] });
  },
);

router.post(
  "/modules/:id/lectures",
  authenticate,
  requireRole("instructor", "admin"),
  upload.single("video"),
  async (req, res) => {
    const module_id = req.params.id;
    const { title, transcript, duration_seconds, order_index, resource_urls } =
      req.body;

    if (!title || order_index === undefined) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "title and order_index are required",
        },
      });
    }

    const moduleResult = await pool.query(
      `SELECT m.id, c.instructor_id
     FROM modules m
     JOIN courses c ON c.id = m.course_id
     WHERE m.id = $1`,
      [module_id],
    );
    const moduleRow = moduleResult.rows[0];

    if (!moduleRow) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Module not found" } });
    }

    const isOwner = moduleRow.instructor_id === req.user!.userId;
    const isAdmin = req.user!.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        error: {
          code: "NOT_COURSE_OWNER",
          message: "You do not own this course",
        },
      });
    }

    let video_url: string | null = null;
    if (req.file) {
      const safeName = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const key = `lectures/${module_id}/${Date.now()}-${safeName}`;
      await uploadFileToMinio(req.file.buffer, key, req.file.mimetype);
      video_url = key; // store the internal key, not a public URL
    }

    let parsedResourceUrls: string[] | null = null;
    if (resource_urls) {
      try {
        parsedResourceUrls = JSON.parse(resource_urls);
      } catch {
        parsedResourceUrls = null;
      }
    }

    const result = await pool.query(
      `INSERT INTO lectures (module_id, title, video_url, transcript, duration_seconds, order_index, resource_urls)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, module_id, title, video_url, transcript, duration_seconds, order_index, resource_urls`,
      [
        module_id,
        title,
        video_url,
        transcript || null,
        duration_seconds ? parseInt(duration_seconds) : null,
        order_index,
        parsedResourceUrls,
      ],
    );

    res.status(201).json({ lecture: result.rows[0] });
  },
);

router.get("/lectures/:id/video-url", authenticate, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user!.userId;
  const role = req.user!.role;

  const result = await pool.query(
    `SELECT l.video_url, c.instructor_id, c.id AS course_id
     FROM lectures l
     JOIN modules m ON m.id = l.module_id
     JOIN courses c ON c.id = m.course_id
     WHERE l.id = $1`,
    [id],
  );
  const lecture = result.rows[0];

  if (!lecture || !lecture.video_url) {
    return res.status(404).json({
      error: { code: "VIDEO_NOT_FOUND", message: "No video for this lecture" },
    });
  }

  const isOwner = lecture.instructor_id === user_id;
  const isAdmin = role === "admin";

  if (!isOwner && !isAdmin) {
    const enrollmentCheck = await pool.query(
      `SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2`,
      [user_id, lecture.course_id],
    );
    if (enrollmentCheck.rows.length === 0) {
      return res.status(403).json({
        error: {
          code: "NOT_ENROLLED",
          message: "You must be enrolled in this course to view this video",
        },
      });
    }
  }

  const signedUrl = await getPresignedVideoUrl(lecture.video_url);
  res.json({ url: signedUrl });
});

router.get("/:id", async (req, res) => {
  const course_id = req.params.id;

  const courseResult = await pool.query("SELECT * FROM courses WHERE id = $1", [
    course_id,
  ]);
  const course = courseResult.rows[0];

  if (!course) {
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Course not found" } });
  }

  const modulesResult = await pool.query(
    "SELECT * FROM modules WHERE course_id = $1 ORDER BY order_index",
    [course_id],
  );

  const lecturesResult = await pool.query(
    `SELECT l.id, l.module_id, l.title, l.video_url, l.duration_seconds,
            l.order_index, l.resource_urls,
            (l.transcript IS NOT NULL AND l.transcript != '') AS has_transcript
     FROM lectures l
     JOIN modules m ON m.id = l.module_id
     WHERE m.course_id = $1
     ORDER BY l.order_index`,
    [course_id],
  );

  // Each module's quizzes — kept lightweight (id/title only) since this is
  // just for the "manage" screen to link into, not the full quiz content.
    const quizzesResult = await pool.query(
    `SELECT q.id, q.module_id, q.title, q.is_ai_generated, q.is_published
     FROM quizzes q
     JOIN modules m ON m.id = q.module_id
     WHERE m.course_id = $1
     ORDER BY q.title`,
    [course_id],
  );

  // Course-level assignments — not tied to a specific module.
  const assignmentsResult = await pool.query(
    `SELECT id, title, due_date FROM assignments WHERE course_id = $1 ORDER BY due_date`,
    [course_id],
  );

  const modules = modulesResult.rows.map((mod) => ({
    ...mod,
    lectures: lecturesResult.rows.filter((lec) => lec.module_id === mod.id),
    quizzes: quizzesResult.rows.filter((q) => q.module_id === mod.id),
  }));

  res.json({
    course: {
      ...course,
      modules,
      assignments: assignmentsResult.rows,
    },
  });
});

router.get(
  "/:id/analytics",
  authenticate,
  requireRole("instructor", "admin"),
  async (req, res) => {
    const course_id = req.params.id;

    const courseResult = await pool.query(
      "SELECT id, instructor_id FROM courses WHERE id = $1",
      [course_id],
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

    const enrollmentCountResult = await pool.query(
      "SELECT COUNT(*)::int AS total FROM enrollments WHERE course_id = $1",
      [course_id],
    );
    const totalEnrolled = enrollmentCountResult.rows[0].total;

    const lectureStatsResult = await pool.query(
      `SELECT
         l.id AS lecture_id,
         l.title,
         l.order_index,
         m.order_index AS module_order_index,
         COUNT(lp.id) FILTER (WHERE lp.completed = true)::int AS completed_count,
         COALESCE(AVG(lp.watched_seconds), 0)::float AS avg_watched_seconds
       FROM lectures l
       JOIN modules m ON m.id = l.module_id
       LEFT JOIN enrollments e ON e.course_id = m.course_id
       LEFT JOIN lecture_progress lp ON lp.enrollment_id = e.id AND lp.lecture_id = l.id
       WHERE m.course_id = $1
       GROUP BY l.id, l.title, l.order_index, m.order_index
       ORDER BY m.order_index, l.order_index, l.id`,
      [course_id],
    );

    let previousRate: number | null = null;
    const lectures = lectureStatsResult.rows.map((row) => {
      const completionRate =
        totalEnrolled > 0 ? (row.completed_count / totalEnrolled) * 100 : 0;
      const dropOffFromPrevious =
        previousRate === null
          ? null
          : Math.max(previousRate - completionRate, 0);
      previousRate = completionRate;

      return {
        lecture_id: row.lecture_id,
        title: row.title,
        completion_rate_percent: Math.round(completionRate * 10) / 10,
        drop_off_from_previous_percent:
          dropOffFromPrevious === null
            ? null
            : Math.round(dropOffFromPrevious * 10) / 10,
        avg_watched_seconds: Math.round(row.avg_watched_seconds),
      };
    });

    const quizStatsResult = await pool.query(
      `SELECT
         q.id AS quiz_id,
         q.title,
         COUNT(qa.id) FILTER (WHERE qa.submitted_at IS NOT NULL)::int AS attempts_count,
         AVG(qa.score) FILTER (WHERE qa.submitted_at IS NOT NULL)::float AS avg_score
       FROM quizzes q
       JOIN modules m ON m.id = q.module_id
       LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id
       WHERE m.course_id = $1
       GROUP BY q.id, q.title
       ORDER BY q.title`,
      [course_id],
    );

    const quizzes = quizStatsResult.rows.map((row) => ({
      quiz_id: row.quiz_id,
      title: row.title,
      attempts_count: row.attempts_count,
      avg_score:
        row.avg_score === null ? null : Math.round(row.avg_score * 10) / 10,
    }));

    res.json({
      course_id,
      total_enrolled: totalEnrolled,
      lectures,
      quizzes,
    });
  },
);

router.put(
  "/:id",
  authenticate,
  requireRole("instructor", "admin"),
  async (req, res) => {
    const course_id = req.params.id;

    const courseResult = await pool.query(
      "SELECT * FROM courses WHERE id = $1",
      [course_id],
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

    const title = req.body.title ?? course.title;
    const description = req.body.description ?? course.description;
    const category = req.body.category ?? course.category;
    const difficulty = req.body.difficulty ?? course.difficulty;
    const thumbnail_url = req.body.thumbnail_url ?? course.thumbnail_url;
    const price = req.body.price ?? course.price;

    const result = await pool.query(
      `UPDATE courses
     SET title = $1, description = $2, category = $3, difficulty = $4, thumbnail_url = $5, price = $6
     WHERE id = $7
     RETURNING *`,
      [
        title,
        description,
        category,
        difficulty,
        thumbnail_url,
        price,
        course_id,
      ],
    );

    res.json({ course: result.rows[0] });
  },
);

// DELETE /:id — archive a course (soft delete)
router.delete(
  "/:id",
  authenticate,
  requireRole("instructor", "admin"),
  async (req, res) => {
    const { id } = req.params;

    // Fetch the course first — need instructor_id for ownership check, and to 404 if missing
    const courseResult = await pool.query(
      "SELECT * FROM courses WHERE id = $1",
      [id],
    );
    const course = courseResult.rows[0];

    if (!course) {
      return res.status(404).json({ error: "COURSE_NOT_FOUND" });
    }

    // Ownership check — same pattern as PUT /:id
    if (
      course.instructor_id !== req.user!.userId &&
      req.user!.role !== "admin"
    ) {
      return res.status(403).json({ error: "NOT_COURSE_OWNER" });
    }

    const result = await pool.query(
      `UPDATE courses SET status = 'archived' WHERE id = $1 RETURNING *`,
      [id],
    );

    res.json(result.rows[0]);
  },
);

export default router;
