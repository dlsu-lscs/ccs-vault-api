-- Up
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub TEXT NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'Student' CHECK (role IN ('Student', 'Admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down
DROP TABLE IF EXISTS users;
