import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../../db/pool";

const router = Router();

router.post("/register", async (req, res) => {
  const { full_name, email, password } = req.body;
  if (!full_name || !email || !password) {
    return res
      .status(400)
      .json({
        error: {
          code: "VALIDATION_ERROR",
          message: "full_name, email, password are required",
        },
      });
  }

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  if (existing.rows.length > 0) {
    return res
      .status(400)
      .json({
        error: { code: "EMAIL_EXISTS", message: "Email already registered" },
      });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    "INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, full_name, email",
    [full_name, email, password_hash],
  );

  const user = result.rows[0];
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'student'`,
    [user.id],
  );

  res.status(201).json({ user });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const result = await pool.query("SELECT * FROM users WHERE email = $1", [
    email,
  ]);
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res
      .status(401)
      .json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      });
  }

  const roleResult = await pool.query(
    `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1 LIMIT 1`,
    [user.id],
  );
  const role = roleResult.rows[0]?.name || "student";

  const access_token = jwt.sign(
    { userId: user.id, role },
    process.env.JWT_SECRET as string,
    { expiresIn: "15m" },
  );
  res.json({
    access_token,
    user: { id: user.id, full_name: user.full_name, email: user.email, role },
  });
});

export default router;
