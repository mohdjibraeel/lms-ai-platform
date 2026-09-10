import { pool } from "../db/pool";

export async function updateStreakForUser(userId: string) {
  await pool.query(
    `INSERT INTO streaks (user_id, current_streak, longest_streak, last_active_date)
     VALUES ($1, 1, 1, CURRENT_DATE)
     ON CONFLICT (user_id) DO UPDATE SET
       current_streak = CASE
         WHEN streaks.last_active_date = CURRENT_DATE THEN streaks.current_streak
         WHEN streaks.last_active_date = CURRENT_DATE - INTERVAL '1 day' THEN streaks.current_streak + 1
         ELSE 1
       END,
       longest_streak = GREATEST(
         streaks.longest_streak,
         CASE
           WHEN streaks.last_active_date = CURRENT_DATE THEN streaks.current_streak
           WHEN streaks.last_active_date = CURRENT_DATE - INTERVAL '1 day' THEN streaks.current_streak + 1
           ELSE 1
         END
       ),
       last_active_date = CURRENT_DATE
     WHERE streaks.user_id = $1 OR streaks.user_id IS NULL`,
    [userId]
  );
}