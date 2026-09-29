-- Gap — Discussion forum (PRD entity list §7.1: discussion_threads,
-- discussion_posts). One thread per topic a student/instructor starts;
-- one post per message inside that thread, including the opening message.
CREATE TABLE discussion_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id),
    created_by UUID REFERENCES users(id),
    title VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE discussion_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES discussion_threads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    content TEXT,
    is_flagged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Speeds up "latest threads for THIS course" and "posts inside THIS thread,
-- in order", the two most common questions this forum will be asked.
CREATE INDEX idx_discussion_threads_course
    ON discussion_threads (course_id, created_at DESC);
CREATE INDEX idx_discussion_posts_thread
    ON discussion_posts (thread_id, created_at ASC);

-- Speeds up the admin moderation screen (Step 5): "show me every flagged
-- post, across all courses, so it can be reviewed."
CREATE INDEX idx_discussion_posts_flagged
    ON discussion_posts (is_flagged) WHERE is_flagged = TRUE;