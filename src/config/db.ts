import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

function isTestEnvironment(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.argv.includes("--test") ||
    process.execArgv.includes("--test") ||
    process.argv.some((arg) => arg.includes("--test"))
  );
}

if (isTestEnvironment()) {
  process.env.NODE_ENV = "test";
}

function getConnectionString(): string {
  if (process.env.NODE_ENV === "test") {
    if (process.env.TEST_DATABASE_URL) {
      return process.env.TEST_DATABASE_URL;
    }
    if (process.env.DATABASE_URL_TEST) {
      return process.env.DATABASE_URL_TEST;
    }
    if (
      process.env.DATABASE_URL &&
      (process.env.DATABASE_URL.endsWith("_test") ||
        process.env.DATABASE_URL.includes("/ccs_vault_test"))
    ) {
      return process.env.DATABASE_URL;
    }
    return "postgresql://postgres:postgres@localhost:5432/ccs_vault_test";
  }

  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (process.env.NODE_ENV === "development") {
    return "postgresql://postgres:postgres@localhost:5432/ccs_vault";
  }

  throw new Error(
    "DATABASE_URL environment variable is required outside development."
  );
}

export const pool = new Pool({
  connectionString: getConnectionString(),
});

pool.on("error", (err: Error) => {
  console.error("Unexpected error on idle PostgreSQL client", err);
  process.exit(-1);
});

export const query = (text: string, params?: unknown[]) => {
  return pool.query(text, params);
};

export default pool;
