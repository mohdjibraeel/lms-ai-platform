import cron from "node-cron";
import { pool } from "../db/pool";

export function startStreakCronJob() {
  // Runs once daily at midnight server time
  cron.schedule("0 0 * * *", async () => {
    try {
      const result = await pool.query(
        `UPDATE streaks SET current_streak = 0
         WHERE last_active_date < CURRENT_DATE - INTERVAL '1 day'
         AND current_streak != 0`,
      );
      console.log(
        `[streak-cron] Reset streaks for ${result.rowCount} inactive user(s)`,
      );
    } catch (err) {
      console.error("[streak-cron] Failed:", err);
    }
  });

  console.log("[streak-cron] Daily streak evaluation job scheduled");
}
