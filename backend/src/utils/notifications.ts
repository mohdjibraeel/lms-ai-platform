import { pool } from "../db/pool";

// ---------------------------------------------------------------------------
// Reusable "send a notification" helpers (PRD: in-app notifications).
//
// Any feature (grading, announcements, forum replies...) can call these
// instead of writing its own INSERT. Both functions deliberately NEVER throw:
// a failed notification must not break the real action that triggered it
// (e.g. a grade must still be saved even if the notification insert fails).
// Errors are just logged to the server console.
// ---------------------------------------------------------------------------

/** Notify ONE person. */
export async function createNotification(
  userId: string,
  title: string,
  body: string,
  link?: string,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, title, body, link)
       VALUES ($1, $2, $3, $4)`,
      [userId, title, body, link ?? null],
    );
  } catch (err) {
    console.error(`Failed to create notification for user ${userId}:`, err);
  }
}

/** Notify MANY people with the same message (one row per person). */
export async function notifyMany(
  userIds: string[],
  title: string,
  body: string,
  link?: string,
): Promise<void> {
  if (userIds.length === 0) return;

  try {
    await pool.query(
      `INSERT INTO notifications (user_id, title, body, link)
       SELECT unnest($1::uuid[]), $2::varchar, $3::text, $4::varchar`,
      [userIds, title, body, link ?? null],
    );
  } catch (err) {
    console.error(`Failed to create ${userIds.length} notifications:`, err);
  }
}