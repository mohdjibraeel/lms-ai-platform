CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    course_id UUID REFERENCES courses(id),
    enrolled_at TIMESTAMPTZ DEFAULT now(),
    progress_percent NUMERIC(5,2) DEFAULT 0,
    UNIQUE (user_id, course_id)
);