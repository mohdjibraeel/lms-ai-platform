-- Gap — Instructor announcements (PRD FR-I6: "Instructor can post
-- announcements visible to all enrolled students"). One row per announcement,
-- belonging to one course and written by that course's instructor.
CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id),
    posted_by UUID REFERENCES users(id),
    title VARCHAR(150),           -- short headline; also used as the notification title
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Speeds up the common question: "latest announcements for THIS course".
CREATE INDEX idx_announcements_course
    ON announcements (course_id, created_at DESC);