import http from "node:http";
import { AddressInfo } from "node:net";
import app from "../src/app.js";
import pool from "../src/config/db.js";
import { migrateUp } from "../src/config/migrate.js";

export async function assertTestDatabase(): Promise<void> {
  const result = await pool.query<{ current_database: string }>(
    "SELECT current_database();"
  );
  const dbName = result.rows[0]?.current_database;
  if (!dbName || (!dbName.endsWith("_test") && dbName !== "ccs_vault_test")) {
    throw new Error(
      `Safety guard triggered: Refusing to run tests or reset database on non-test database "${dbName}". Tests must run against a database ending with "_test" (e.g. "ccs_vault_test").`
    );
  }
}

export async function setupTestDatabase(): Promise<void> {
  await assertTestDatabase();
  await migrateUp();
}

export async function resetDatabase(): Promise<void> {
  await assertTestDatabase();
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

export function createMockGoogleIdToken(payload: {
  sub: string;
  email: string;
  name: string;
  aud?: string;
  iss?: string;
  exp?: number;
}): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({
      iss: payload.iss ?? "https://accounts.google.com",
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      aud: payload.aud ?? process.env.GOOGLE_CLIENT_ID ?? "test-client-id",
      exp: payload.exp ?? Math.floor(Date.now() / 1000) + 3600,
      email_verified: true,
    })
  ).toString("base64url");
  const signature = Buffer.from("mock-signature").toString("base64url");
  return `${header}.${body}.${signature}`;
}
