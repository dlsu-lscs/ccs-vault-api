import pool from "../config/db.js";
import { User } from "../models/user.js";

export interface UpsertUserData {
  google_sub: string;
  email: string;
  name: string;
}

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`An account already exists with email: ${email}`);
    this.name = "DuplicateEmailError";
  }
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
  try {
    const result = await pool.query<User>(query, values);
    return result.rows[0];
  } catch (err: unknown) {
    // PostgreSQL unique_violation error code: 23505
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "23505" &&
      "constraint" in err &&
      typeof (err as { constraint: string }).constraint === "string" &&
      (err as { constraint: string }).constraint.includes("email")
    ) {
      throw new DuplicateEmailError(data.email);
    }
    throw err;
  }
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
