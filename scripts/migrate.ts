import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing. Add it to .env before running migrations.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
});

const migrationPath = join(process.cwd(), "migrations", "001_initial_schema.sql");
const sql = await readFile(migrationPath, "utf8");

try {
  await pool.query(sql);
  console.log("Migration completed: 001_initial_schema.sql");
} finally {
  await pool.end();
}
