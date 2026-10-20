import fs from "node:fs";
import path from "node:path";
import pool from "./db.js";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "database/migrations");

async function ensureMigrationTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>(
    "SELECT name FROM schema_migrations ORDER BY id ASC;"
  );
  return new Set(result.rows.map((row) => row.name));
}

async function migrateUp(): Promise<void> {
  await ensureMigrationTable();
  const appliedMigrations = await getAppliedMigrations();

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log("Migrations directory does not exist.");
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".up.sql") || (file.endsWith(".sql") && !file.endsWith(".down.sql")))
    .sort();

  let appliedCount = 0;

  for (const file of files) {
    const migrationName = file.replace(/(\.up)?\.sql$/, "");
    if (appliedMigrations.has(migrationName)) {
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, "utf8");

    const client = await pool.connect();
    try {
      await client.query("BEGIN;");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (name) VALUES ($1);",
        [migrationName]
      );
      await client.query("COMMIT;");
      console.log(`Applied migration: ${file}`);
      appliedCount++;
    } catch (error) {
      await client.query("ROLLBACK;");
      console.error(`Failed to apply migration ${file}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  if (appliedCount === 0) {
    console.log("No pending migrations to apply.");
  } else {
    console.log(`Successfully applied ${appliedCount} migration(s).`);
  }
}

async function migrateDown(): Promise<void> {
  await ensureMigrationTable();

  const client = await pool.connect();
  try {
    const result = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations ORDER BY id DESC LIMIT 1;"
    );

    if (result.rows.length === 0) {
      console.log("No migrations to rollback.");
      return;
    }

    const migrationName = result.rows[0].name;
    const downFileName = `${migrationName}.down.sql`;
    const downFilePath = path.join(MIGRATIONS_DIR, downFileName);

    if (!fs.existsSync(downFilePath)) {
      throw new Error(`Rollback file not found: ${downFileName}`);
    }

    const sql = fs.readFileSync(downFilePath, "utf8");

    await client.query("BEGIN;");
    await client.query(sql);
    await client.query(
      "DELETE FROM schema_migrations WHERE name = $1;",
      [migrationName]
    );
    await client.query("COMMIT;");
    console.log(`Rolled back migration: ${downFileName}`);
  } catch (error) {
    await client.query("ROLLBACK;");
    console.error("Failed to rollback migration:", error);
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] || "up";

  try {
    if (command === "up") {
      await migrateUp();
    } else if (command === "down") {
      await migrateDown();
    } else {
      console.error(`Unknown command: ${command}. Use "up" or "down".`);
      process.exitCode = 1;
    }
  } catch {
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
