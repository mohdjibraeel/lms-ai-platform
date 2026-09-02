import { Router } from "express";
import { pool } from "../../db/pool";
import { authenticate, requireRole } from "../../middleware/auth.middleware";

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
  const result = await pool.query(
    `SELECT id, instructor_id, title, description, category, difficulty, thumbnail_url, price, status, created_at
     FROM courses
     ORDER BY created_at DESC`,
  );
  res.json({ courses: result.rows });
});

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
      return res
        .status(400)
        .json({
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
        return res
          .status(409)
          .json({
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

export default router;
