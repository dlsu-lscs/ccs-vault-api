import pool from "../config/db.js";
import { CreateSessionInput, Session, SessionWithUser } from "../models/session.js";
import { UserRole } from "../models/user.js";

export async function createSession(data: CreateSessionInput): Promise<Session> {
  const query = `
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES ($1, $2, $3)
    RETURNING id, user_id, expires_at, created_at;
  `;

  const values = [data.id, data.user_id, data.expires_at];
  const result = await pool.query<Session>(query, values);
  return result.rows[0];
}

export async function findSessionById(id: string): Promise<Session | null> {
  const query = `
    SELECT id, user_id, expires_at, created_at
    FROM sessions
    WHERE id = $1;
  `;

  const result = await pool.query<Session>(query, [id]);
  return result.rows[0] ?? null;
}

interface SessionWithUserRow {
  session_id: string;
  user_id: string;
  expires_at: Date;
  session_created_at: Date;
  google_sub: string;
  email: string;
  name: string;
  role: UserRole;
  user_created_at: Date;
}

export async function findSessionWithUserById(
  id: string
): Promise<SessionWithUser | null> {
  const query = `
    SELECT
      s.id AS session_id,
      s.user_id,
      s.expires_at,
      s.created_at AS session_created_at,
      u.google_sub,
      u.email,
      u.name,
      u.role,
      u.created_at AS user_created_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = $1;
  `;

  const result = await pool.query<SessionWithUserRow>(query, [id]);
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.session_id,
    user_id: row.user_id,
    expires_at: row.expires_at,
    created_at: row.session_created_at,
    user: {
      id: row.user_id,
      google_sub: row.google_sub,
      email: row.email,
      name: row.name,
      role: row.role,
      created_at: row.user_created_at,
    },
  };
}

export async function deleteSessionById(id: string): Promise<boolean> {
  const query = `
    DELETE FROM sessions
    WHERE id = $1;
  `;

  const result = await pool.query(query, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function deleteExpiredSessions(): Promise<number> {
  const query = `
    DELETE FROM sessions
    WHERE expires_at <= now();
  `;

  const result = await pool.query(query);
  return result.rowCount ?? 0;
}
