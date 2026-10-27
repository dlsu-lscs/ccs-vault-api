import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import pool from "../src/config/db.js";
import { createSession } from "../src/services/session-service.js";
import { getOrCreateUserFromGoogle } from "../src/services/user-service.js";
import {
  createTestServer,
  resetDatabase,
  setupTestDatabase,
} from "./helpers.js";

describe("GET /api/courses API Tests", () => {
  const testServer = createTestServer();
  let baseUrl: string;
  let validSessionCookie: string;
  let testUser: { id: string };

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

    // Create a default authenticated user and session
    testUser = await getOrCreateUserFromGoogle({
      google_sub: "google-sub-courses-test",
      email: "courses.tester@dlsu.edu.ph",
      name: "Courses Tester",
    });

    const { rawToken } = await createSession(testUser.id);
    validSessionCookie = `vault_session=${rawToken}`;
  });

  it("1. returns 401 without a valid session", async () => {
    // Request without cookie
    const noCookieRes = await fetch(`${baseUrl}/api/courses`);
    assert.strictEqual(noCookieRes.status, 401);
    const noCookieBody = await noCookieRes.json();
    assert.strictEqual(noCookieBody.error.code, "UNAUTHORIZED");

    // Request with invalid cookie
    const invalidCookieRes = await fetch(`${baseUrl}/api/courses`, {
      headers: {
        Cookie: "vault_session=non-existent-random-token",
      },
    });
    assert.strictEqual(invalidCookieRes.status, 401);
    const invalidCookieBody = await invalidCookieRes.json();
    assert.strictEqual(invalidCookieBody.error.code, "UNAUTHORIZED");
  });

  it("2. returns [] when there are no courses", async () => {
    const res = await fetch(`${baseUrl}/api/courses`, {
      headers: {
        Cookie: validSessionCookie,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
    assert.strictEqual(data.length, 0);
  });

  it("3. returns courses with zero resources (published_resource_count: 0)", async () => {
    await pool.query(
      "INSERT INTO courses (code, name) VALUES ($1, $2)",
      ["CCDSALG", "Data Structures and Algorithms"]
    );

    const res = await fetch(`${baseUrl}/api/courses`, {
      headers: {
        Cookie: validSessionCookie,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].code, "CCDSALG");
    assert.strictEqual(data[0].published_resource_count, 0);
  });

  it("4. accurately counts only published resources for each course", async () => {
    // Create course 1
    const course1Res = await pool.query(
      "INSERT INTO courses (code, name) VALUES ($1, $2) RETURNING id",
      ["CCPROG1", "Logic Formulation and Introductory Programming"]
    );
    const course1Id = course1Res.rows[0].id;

    // Create topic for course 1
    const topic1Res = await pool.query(
      "INSERT INTO topics (course_id, name, description) VALUES ($1, $2, $3) RETURNING id",
      [course1Id, "Variables and Conditionals", "Basics of C syntax"]
    );
    const topic1Id = topic1Res.rows[0].id;

    // Add 2 published resources and 1 unpublished draft resource for course 1
    await pool.query(`
      INSERT INTO resources (
        title, description, resource_type, author_source, year, term, published,
        course_id, topic_id, uploaded_by
      ) VALUES
        ('Reviewer 1', 'Basics of C', 'Doc', 'Prof. Smith', 2026, 'Term 1', true, '${course1Id}', '${topic1Id}', '${testUser.id}'),
        ('Sample Exam', 'Midterm reviewer', 'PDF reviewer', 'LSCS Acads', 2026, 'Term 1', true, '${course1Id}', '${topic1Id}', '${testUser.id}'),
        ('Unpublished Draft', 'WIP notes', 'Doc', 'Draft Author', 2026, 'Term 1', false, '${course1Id}', '${topic1Id}', '${testUser.id}')
    `);

    // Create course 2 with 0 resources
    await pool.query(
      "INSERT INTO courses (code, name) VALUES ($1, $2)",
      ["CSARCH1", "Introduction to Computer Organization and Architecture"]
    );

    const res = await fetch(`${baseUrl}/api/courses`, {
      headers: {
        Cookie: validSessionCookie,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.length, 2);

    const ccprog1 = data.find((c: { code: string }) => c.code === "CCPROG1");
    const csarch1 = data.find((c: { code: string }) => c.code === "CSARCH1");

    assert.ok(ccprog1);
    assert.ok(csarch1);
    assert.strictEqual(ccprog1.published_resource_count, 2);
    assert.strictEqual(csarch1.published_resource_count, 0);
  });

  it("5. sorts courses by course code case-insensitively", async () => {
    // Insert courses in non-alphabetical mixed-case order
    await pool.query(`
      INSERT INTO courses (code, name) VALUES
        ('CSARCH2', 'Advanced Computer Architecture'),
        ('ccprog1', 'Logic Formulation 1'),
        ('CCPROG2', 'Advanced Programming in C'),
        ('animo1', 'Lasallian Studies')
    `);

    const res = await fetch(`${baseUrl}/api/courses`, {
      headers: {
        Cookie: validSessionCookie,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.length, 4);

    const codes = data.map((c: { code: string }) => c.code);
    assert.deepStrictEqual(codes, [
      "animo1",
      "ccprog1",
      "CCPROG2",
      "CSARCH2",
    ]);
  });
});
