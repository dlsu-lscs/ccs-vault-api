import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pool from "../src/config/db.js";
import { migrateDown, migrateUp } from "../src/config/migrate.js";
import { assertTestDatabase } from "./helpers.js";

describe("Database Migrations & Rollback (Ticket 1)", () => {
  before(async () => {
    await assertTestDatabase();
  });

  after(async () => {
    await pool.end();
  });

  it("enforces that running migrate:up followed by migrate:down rolls back completely, leaving only schema_migrations", async () => {
    // 1. Ensure all migrations are applied
    await migrateUp();

    // Verify all expected application tables exist
    const tablesAfterUp = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC;
    `);
    const tableNamesAfterUp = tablesAfterUp.rows.map((r) => r.table_name);
    assert.ok(tableNamesAfterUp.includes("users"));
    assert.ok(tableNamesAfterUp.includes("sessions"));
    assert.ok(tableNamesAfterUp.includes("courses"));
    assert.ok(tableNamesAfterUp.includes("topics"));
    assert.ok(tableNamesAfterUp.includes("resources"));
    assert.ok(tableNamesAfterUp.includes("schema_migrations"));

    // 2. Roll back each migration (3 migrations exist)
    await migrateDown();
    await migrateDown();
    await migrateDown();

    // 3. Verify that only schema_migrations remains in public schema
    const tablesAfterDown = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);
    const tableNamesAfterDown = tablesAfterDown.rows.map((r) => r.table_name);
    assert.deepStrictEqual(tableNamesAfterDown, ["schema_migrations"]);

    // Verify schema_migrations has 0 rows
    const countRes = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::int AS count FROM schema_migrations;"
    );
    assert.strictEqual(Number(countRes.rows[0].count), 0);

    // 4. Re-apply all migrations so tables are left in ready state
    await migrateUp();

    const restoredTables = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC;
    `);
    const restoredTableNames = restoredTables.rows.map((r) => r.table_name);
    assert.ok(restoredTableNames.includes("users"));
    assert.ok(restoredTableNames.includes("sessions"));
    assert.ok(restoredTableNames.includes("courses"));
    assert.ok(restoredTableNames.includes("topics"));
    assert.ok(restoredTableNames.includes("resources"));
  });
});
