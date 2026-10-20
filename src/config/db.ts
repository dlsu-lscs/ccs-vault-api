import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/ccs_vault",
});

pool.on("error", (err: Error) => {
  console.error("Unexpected error on idle PostgreSQL client", err);
  process.exit(-1);
});

export const query = (text: string, params?: unknown[]) => {
  return pool.query(text, params);
};

export default pool;
