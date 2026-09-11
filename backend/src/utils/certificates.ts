import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { pool } from "../db/pool";
import { uploadFileToMinio } from "../storage/minioClient";

export async function generateCertificateIfEligible(userId: string, courseId: string) {
  // Idempotency check — never generate a second certificate for the same user+course
  const existing = await pool.query(
    `SELECT id FROM certificates WHERE user_id = $1 AND course_id = $2`,
    [userId, courseId]
  );
  if (existing.rows.length > 0) return;

  // Fetch the real name/title to print on the certificate
  const userResult = await pool.query(`SELECT full_name FROM users WHERE id = $1`, [userId]);
  const courseResult = await pool.query(`SELECT title FROM courses WHERE id = $1`, [courseId]);
  const fullName = userResult.rows[0].full_name;
  const courseTitle = courseResult.rows[0].title;

  // Build the actual PDF
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 400]);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText("Certificate of Completion", { x: 100, y: 320, size: 24, font, color: rgb(0.1, 0.1, 0.4) });
  page.drawText(fullName, { x: 100, y: 260, size: 20, font });
  page.drawText(`has successfully completed`, { x: 100, y: 220, size: 14, font });
  page.drawText(courseTitle, { x: 100, y: 190, size: 18, font });
  page.drawText(new Date().toLocaleDateString(), { x: 100, y: 100, size: 12, font });

  const pdfBytes = await pdfDoc.save();

  // Upload to MinIO — same private-key pattern as videos/assignments
  const key = `certificates/${courseId}/${userId}-${Date.now()}.pdf`;
  await uploadFileToMinio(Buffer.from(pdfBytes), key, "application/pdf");

  // Was this the student's very first certificate? (for the "First Course Completed" badge)
  const priorCertCount = await pool.query(
    `SELECT COUNT(*) FROM certificates WHERE user_id = $1`,
    [userId]
  );
  const isFirstCertificate = parseInt(priorCertCount.rows[0].count, 10) === 0;

  await pool.query(
    `INSERT INTO certificates (user_id, course_id, certificate_url) VALUES ($1, $2, $3)`,
    [userId, courseId, key]
  );

  if (isFirstCertificate) {
    await pool.query(
      `INSERT INTO user_badges (user_id, badge_id) VALUES ($1, 1) ON CONFLICT DO NOTHING`,
      [userId]
    );
  }
}