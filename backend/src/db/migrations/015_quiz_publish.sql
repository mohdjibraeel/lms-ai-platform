ALTER TABLE quizzes ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT true;

UPDATE quizzes SET is_published = false WHERE is_ai_generated = true;