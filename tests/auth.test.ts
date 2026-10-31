import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import pool from "../src/config/db.js";
import {
  createSession,
  deleteSession,
  hashSessionToken,
  validateSession,
} from "../src/services/session-service.js";
import { getOrCreateUserFromGoogle } from "../src/services/user-service.js";
import {
  createMockGoogleIdToken,
  createTestServer,
  extractSessionCookie,
  isSessionCookieCleared,
  resetDatabase,
  setupTestDatabase,
} from "./helpers.js";

describe("Authentication & Session Management", () => {
  const testServer = createTestServer();
  let baseUrl: string;

  before(async () => {
    await setupTestDatabase();
    baseUrl = await testServer.start();
  });

  after(async () => {
    await testServer.close();
    await pool.end();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  describe("User Sign-in & Role Resolution", () => {
    it("1. first sign-in assigns the Student role", async () => {
      const profile = {
        google_sub: "google-sub-first",
        email: "first.student@dlsu.edu.ph",
        name: "First Student",
      };

      const user = await getOrCreateUserFromGoogle(profile);

      assert.ok(user.id);
      assert.strictEqual(user.role, "Student");
      assert.strictEqual(user.email, "first.student@dlsu.edu.ph");
      assert.strictEqual(user.name, "First Student");

      // Verify directly in database
      const dbRes = await pool.query("SELECT * FROM users WHERE id = $1", [
        user.id,
      ]);
      assert.strictEqual(dbRes.rowCount, 1);
      assert.strictEqual(dbRes.rows[0].role, "Student");
    });

    it("2. repeat sign-ins reuse the same user ID without creating duplicates", async () => {
      const profile = {
        google_sub: "google-sub-repeat",
        email: "repeat.user@dlsu.edu.ph",
        name: "Repeat User",
      };

      const firstResult = await getOrCreateUserFromGoogle(profile);
      const secondResult = await getOrCreateUserFromGoogle(profile);
      const thirdResult = await getOrCreateUserFromGoogle(profile);

      assert.strictEqual(firstResult.id, secondResult.id);
      assert.strictEqual(secondResult.id, thirdResult.id);

      const dbRes = await pool.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE google_sub = $1",
        [profile.google_sub]
      );
      assert.strictEqual(dbRes.rows[0].count, 1);
    });

    it("3. repeat sign-in preserves the Admin role", async () => {
      const profile = {
        google_sub: "google-sub-admin",
        email: "admin.user@dlsu.edu.ph",
        name: "Admin User",
      };

      const initialUser = await getOrCreateUserFromGoogle(profile);
      assert.strictEqual(initialUser.role, "Student");

      // Promote user to Admin in database
      await pool.query("UPDATE users SET role = 'Admin' WHERE id = $1", [
        initialUser.id,
      ]);

      // Sign in again with same Google profile
      const afterSignInUser = await getOrCreateUserFromGoogle(profile);

      assert.strictEqual(afterSignInUser.id, initialUser.id);
      assert.strictEqual(afterSignInUser.role, "Admin");

      // Verify in DB directly
      const dbRes = await pool.query("SELECT role FROM users WHERE id = $1", [
        initialUser.id,
      ]);
      assert.strictEqual(dbRes.rows[0].role, "Admin");
    });

    it("4. repeat sign-in updates changed email and name", async () => {
      const initialProfile = {
        google_sub: "google-sub-update",
        email: "initial.name@dlsu.edu.ph",
        name: "Initial Name",
      };

      const user1 = await getOrCreateUserFromGoogle(initialProfile);
      assert.strictEqual(user1.name, "Initial Name");
      assert.strictEqual(user1.email, "initial.name@dlsu.edu.ph");

      const updatedProfile = {
        google_sub: "google-sub-update",
        email: "updated.name@dlsu.edu.ph",
        name: "Updated Name",
      };

      const user2 = await getOrCreateUserFromGoogle(updatedProfile);
      assert.strictEqual(user2.id, user1.id);
      assert.strictEqual(user2.name, "Updated Name");
      assert.strictEqual(user2.email, "updated.name@dlsu.edu.ph");

      // Verify in DB directly
      const dbRes = await pool.query(
        "SELECT email, name FROM users WHERE id = $1",
        [user1.id]
      );
      assert.strictEqual(dbRes.rows[0].name, "Updated Name");
      assert.strictEqual(dbRes.rows[0].email, "updated.name@dlsu.edu.ph");
    });

    it("5. concurrent first sign-ins create only one user", async () => {
      const sharedProfile = {
        google_sub: "google-sub-concurrent",
        email: "concurrent@dlsu.edu.ph",
        name: "Concurrent User",
      };

      // Launch 10 concurrent sign-in attempts simultaneously
      const results = await Promise.all([
        getOrCreateUserFromGoogle(sharedProfile),
        getOrCreateUserFromGoogle(sharedProfile),
        getOrCreateUserFromGoogle(sharedProfile),
        getOrCreateUserFromGoogle(sharedProfile),
        getOrCreateUserFromGoogle(sharedProfile),
        getOrCreateUserFromGoogle(sharedProfile),
        getOrCreateUserFromGoogle(sharedProfile),
        getOrCreateUserFromGoogle(sharedProfile),
        getOrCreateUserFromGoogle(sharedProfile),
        getOrCreateUserFromGoogle(sharedProfile),
      ]);

      const firstId = results[0].id;
      for (const res of results) {
        assert.strictEqual(res.id, firstId);
      }

      const dbRes = await pool.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE google_sub = $1",
        [sharedProfile.google_sub]
      );
      assert.strictEqual(dbRes.rows[0].count, 1);
    });
  });

  describe("Session Storage & Security", () => {
    it("6. stores only the SHA-256 session token hash in the database", async () => {
      const user = await getOrCreateUserFromGoogle({
        google_sub: "google-sub-token-test",
        email: "tokentest@dlsu.edu.ph",
        name: "Token Test",
      });

      const { rawToken } = await createSession(user.id);
      const expectedHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      // Raw token must never equal the hash
      assert.notStrictEqual(rawToken, expectedHash);

      // Verify database table
      const dbRes = await pool.query("SELECT * FROM sessions WHERE user_id = $1", [
        user.id,
      ]);
      assert.strictEqual(dbRes.rowCount, 1);

      const dbSession = dbRes.rows[0];
      // The session ID in DB must be the SHA-256 hash
      assert.strictEqual(dbSession.id, expectedHash);

      // Raw token must not appear in any column of the row
      const rowValues = Object.values(dbSession).map(String);
      assert.ok(!rowValues.includes(rawToken));
    });

    it("7. rejects expired sessions directly at the database layer", async () => {
      const user = await getOrCreateUserFromGoogle({
        google_sub: "google-sub-expiry",
        email: "expiry@dlsu.edu.ph",
        name: "Expiry Test",
      });

      const rawToken = "test-raw-token-for-expiry-check";
      const tokenHash = hashSessionToken(rawToken);

      // Insert session that expired 1 hour ago
      const pastDate = new Date(Date.now() - 3600000);
      await pool.query(
        "INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)",
        [tokenHash, user.id, pastDate]
      );

      // validateSession must return null
      const validated = await validateSession(rawToken);
      assert.strictEqual(validated, null);

      // HTTP request using this expired session cookie must receive 401
      const res = await fetch(`${baseUrl}/api/courses`, {
        headers: {
          Cookie: `vault_session=${rawToken}`,
        },
      });
      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.strictEqual(body.error.code, "UNAUTHORIZED");
    });

    it("8. sign-out deletes the session and clears the cookie", async () => {
      const user = await getOrCreateUserFromGoogle({
        google_sub: "google-sub-signout",
        email: "signout@dlsu.edu.ph",
        name: "Signout Test",
      });

      const { rawToken } = await createSession(user.id);
      const tokenHash = hashSessionToken(rawToken);

      // Verify session exists in DB
      const checkBefore = await pool.query(
        "SELECT * FROM sessions WHERE id = $1",
        [tokenHash]
      );
      assert.strictEqual(checkBefore.rowCount, 1);

      // Call sign-out endpoint
      const res = await fetch(`${baseUrl}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          Cookie: `vault_session=${rawToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.message, "Signed out successfully");

      // Verify cookie is cleared
      assert.ok(isSessionCookieCleared(res));

      // Verify session is deleted from database
      const checkAfter = await pool.query(
        "SELECT * FROM sessions WHERE id = $1",
        [tokenHash]
      );
      assert.strictEqual(checkAfter.rowCount, 0);

      // Subsequent attempt to access protected endpoint should fail with 401
      const retryRes = await fetch(`${baseUrl}/api/courses`, {
        headers: {
          Cookie: `vault_session=${rawToken}`,
        },
      });
      assert.strictEqual(retryRes.status, 401);
    });
  });

  describe("HTTP Sign-in & Authentication Flow", () => {
    it("POST /api/auth/sign-in returns 201 on first sign-in, creates user/session, omits user from response, and sets cookie", async () => {
      const mockToken = createMockGoogleIdToken({
        sub: "google-sub-api-login",
        email: "student.login@dlsu.edu.ph",
        name: "API Login Student",
      });

      const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: mockToken }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.message, "Signed in successfully");
      assert.strictEqual(data.user, undefined);

      // Verify cookie is set
      const cookie = extractSessionCookie(res);
      assert.ok(cookie);

      // Use the received cookie to access protected endpoint
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: `vault_session=${cookie}`,
        },
      });
      assert.strictEqual(meRes.status, 200);
      const meData = await meRes.json();
      assert.strictEqual(meData.user.email, "student.login@dlsu.edu.ph");
      assert.strictEqual(meData.user.name, "API Login Student");
      assert.strictEqual(meData.user.role, "Student");
    });

    it("POST /api/auth/sign-in returns 200 on repeat sign-in for existing user", async () => {
      const mockToken = createMockGoogleIdToken({
        sub: "google-sub-repeat-api-login",
        email: "repeat.api@dlsu.edu.ph",
        name: "Repeat API Student",
      });

      // First sign-in
      const firstRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: mockToken }),
      });
      assert.strictEqual(firstRes.status, 201);

      // Second sign-in with same verified identity
      const repeatRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: mockToken }),
      });
      assert.strictEqual(repeatRes.status, 200);
      const repeatData = await repeatRes.json();
      assert.strictEqual(repeatData.message, "Signed in successfully");
      assert.strictEqual(repeatData.user, undefined);
      assert.ok(extractSessionCookie(repeatRes));
    });

    it("POST /api/auth/sign-in returns 400 when idToken is missing", async () => {
      const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, "BAD_REQUEST");
    });

    it("POST /api/auth/sign-in returns 401 when idToken is invalid or unverified", async () => {
      const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: "invalid-token" }),
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error.code, "UNAUTHORIZED");
    });

    it("POST /api/auth/sign-in does not accept untrusted client-provided identities", async () => {
      const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          google_sub: "spoofed-admin-sub",
          email: "admin@dlsu.edu.ph",
          name: "Spoofed Admin",
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, "BAD_REQUEST");

      const dbCheck = await pool.query(
        "SELECT * FROM users WHERE google_sub = 'spoofed-admin-sub';"
      );
      assert.strictEqual(dbCheck.rowCount, 0);
    });
  });
});
