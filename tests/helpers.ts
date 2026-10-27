import http from "node:http";
import { AddressInfo } from "node:net";
import app from "../src/app.js";
import pool from "../src/config/db.js";

export async function setupTestDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      google_sub TEXT NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'Student' CHECK (role IN ('Student', 'Admin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(64) PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS courses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(20) NOT NULL,
      name VARCHAR(150) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_code_unique ON courses(lower(code));

    CREATE TABLE IF NOT EXISTS topics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      name VARCHAR(150) NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      resource_type VARCHAR(50) NOT NULL,
      file_key TEXT,
      file_name VARCHAR(255),
      file_size BIGINT,
      content_type VARCHAR(100),
      external_url TEXT,
      author_source VARCHAR(255) NOT NULL,
      year SMALLINT NOT NULL,
      term VARCHAR(50) NOT NULL,
      published BOOLEAN NOT NULL DEFAULT false,
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_resources_course_published ON resources(course_id, published);
  `);
}

export async function resetDatabase(): Promise<void> {
  await pool.query(
    "TRUNCATE TABLE resources, topics, courses, sessions, users CASCADE;"
  );
}

export function createTestServer(): {
  start: () => Promise<string>;
  close: () => Promise<void>;
} {
  let server: http.Server | null = null;
  return {
    start: () =>
      new Promise<string>((resolve, reject) => {
        server = app.listen(0, () => {
          const addr = server?.address() as AddressInfo;
          resolve(`http://127.0.0.1:${addr.port}`);
        });
        server.on("error", reject);
      }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (!server) return resolve();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export function extractSessionCookie(res: globalThis.Response): string | null {
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];

  for (const cookieStr of setCookies) {
    const match = cookieStr.match(/vault_session=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  return null;
}

export function isSessionCookieCleared(res: globalThis.Response): boolean {
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];

  for (const cookieStr of setCookies) {
    if (
      cookieStr.includes("vault_session=") &&
      (cookieStr.includes("Max-Age=0") ||
        cookieStr.includes("Expires=Thu, 01 Jan 1970") ||
        cookieStr.includes("vault_session=;"))
    ) {
      return true;
    }
  }
  return false;
}
