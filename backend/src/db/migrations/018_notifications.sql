-- Gap — Notifications (PRD §7 scope: "Notifications (in-app + email)").
-- One row per notification, addressed to exactly one user.
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    title VARCHAR(150),
    body TEXT,
    link VARCHAR(300),            -- optional: where clicking it should take you, e.g. /courses/abc
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Speeds up the most common question: "show me MY unread notifications, newest first".
CREATE INDEX idx_notifications_user_unread
    ON notifications (user_id, is_read, created_at DESC);