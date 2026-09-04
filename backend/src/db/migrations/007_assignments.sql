CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id),
    title VARCHAR(200),
    instructions TEXT,
    rubric JSONB,
    due_date TIMESTAMPTZ
);

CREATE TABLE assignment_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES assignments(id),
    user_id UUID REFERENCES users(id),
    file_url TEXT,
    submitted_at TIMESTAMPTZ DEFAULT now(),
    grade NUMERIC(5,2),
    feedback TEXT
);