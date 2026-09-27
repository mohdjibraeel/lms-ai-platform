-- Gap — Mastery-score tracking (PRD: adaptive difficulty for AI tutor +
-- smarter recommendations). One row per (student, course), holding a
-- running average of that student's quiz scores in that course.
CREATE TABLE course_mastery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    course_id UUID REFERENCES courses(id),
    mastery_score NUMERIC(5,2),   -- 0-100, average % across graded quiz attempts
    quiz_count INT DEFAULT 0,     -- how many graded attempts fed into this average
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, course_id)
);