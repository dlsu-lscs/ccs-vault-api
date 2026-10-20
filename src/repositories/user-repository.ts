import pool from "../config/db.js";
import { User } from "../models/user.js";

export interface UpsertUserData {
  google_sub: string;
  email: string;
  name: string;
}

export async function upsertUser(data: UpsertUserData): Promise<User> {
  const query = `
    INSERT INTO users (google_sub, email, name, role)
    VALUES ($1, $2, $3, 'Student')
    ON CONFLICT (google_sub) DO UPDATE
    SET
      email = EXCLUDED.email,
      name = EXCLUDED.name
    RETURNING id, google_sub, email, name, role, created_at;
  `;

  const values = [data.google_sub, data.email, data.name];
  const result = await pool.query<User>(query, values);
  return result.rows[0];
}

export async function findById(id: string): Promise<User | null> {
  const query = `
    SELECT id, google_sub, email, name, role, created_at
    FROM users
    WHERE id = $1;
  `;
  const result = await pool.query<User>(query, [id]);
  return result.rows[0] ?? null;
}

export async function findByGoogleSub(googleSub: string): Promise<User | null> {
  const query = `
    SELECT id, google_sub, email, name, role, created_at
    FROM users
    WHERE google_sub = $1;
  `;
  const result = await pool.query<User>(query, [googleSub]);
  return result.rows[0] ?? null;
}

export async function findByEmail(email: string): Promise<User | null> {
  const query = `
    SELECT id, google_sub, email, name, role, created_at
    FROM users
    WHERE email = $1;
  `;
  const result = await pool.query<User>(query, [email]);
  return result.rows[0] ?? null;
}
