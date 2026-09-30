-- Seed the three badges the code awards by hard-coded ID.
-- Safe to run more than once: rows that already exist are left alone.
INSERT INTO badges (id, name, description) VALUES
  (1, 'First Course Completed', 'Awarded when you complete your first course'),
  (2, '7-Day Streak', 'Awarded for learning 7 days in a row'),
  (3, 'Quiz Perfect Score', 'Awarded for scoring 100 percent on a quiz')
ON CONFLICT (id) DO NOTHING;
-- Keep the auto-numbering counter in step with the IDs we just inserted,
-- so a future badge added without an explicit ID doesn't collide.
SELECT setval(pg_get_serial_sequence('badges', 'id'), (SELECT MAX(id) FROM badges));
