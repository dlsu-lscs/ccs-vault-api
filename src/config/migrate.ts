import fs from "node:fs";
import path from "node:path";
import pool from "./db.js";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "database/migrations");

function parseSqlFile(content: string): { up: string; down: string } {
  const upMatch = content.match(/--\s*Up\b[\r\n]*([\s\S]*?)(?=--\s*Down\b|$)/i);
  const downMatch = content.match(/--\s*Down\b[\r\n]*([\s\S]*)$/i);

  const up = upMatch ? upMatch[1].trim() : content.trim();
  const down = downMatch ? downMatch[1].trim() : "";

  return { up, down };
}

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

export async function migrateUp(): Promise<void> {
  await ensureMigrationTable();
  const appliedMigrations = await getAppliedMigrations();

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log("Migrations directory does not exist.");
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  let appliedCount = 0;

  for (const file of files) {
    if (appliedMigrations.has(file)) {
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, file);
    const fileContent = fs.readFileSync(filePath, "utf8");
    const { up } = parseSqlFile(fileContent);

    if (!up) {
      console.warn(`Skipping empty up-migration in: ${file}`);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN;");
      await client.query(up);
      await client.query(
        "INSERT INTO schema_migrations (name) VALUES ($1);",
        [file]
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

export async function migrateDown(): Promise<void> {
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

    const migrationFileName = result.rows[0].name;
    const migrationFilePath = path.join(MIGRATIONS_DIR, migrationFileName);

    if (!fs.existsSync(migrationFilePath)) {
      throw new Error(`Migration file not found: ${migrationFileName}`);
    }

    const fileContent = fs.readFileSync(migrationFilePath, "utf8");
    const { down } = parseSqlFile(fileContent);

    if (!down) {
      throw new Error(`No rollback (-- Down) section found in: ${migrationFileName}`);
    }

    await client.query("BEGIN;");
    await client.query(down);
    await client.query(
      "DELETE FROM schema_migrations WHERE name = $1;",
      [migrationFileName]
    );
    await client.query("COMMIT;");
    console.log(`Rolled back migration: ${migrationFileName}`);
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

const scriptArg = process.argv[1]?.replace(/\\/g, "/");
const isDirectCli =
  scriptArg &&
  (scriptArg.endsWith("/migrate.ts") || scriptArg.endsWith("/migrate.js"));

if (isDirectCli) {
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "development";
  }
  main();
}
