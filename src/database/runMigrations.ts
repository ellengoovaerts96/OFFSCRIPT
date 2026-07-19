import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;

export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing. Add it before running migrations.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
  });

  try {
    const migrationsDir = join(process.cwd(), "migrations");
    const migrationFiles = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of migrationFiles) {
      const sql = await readFile(join(migrationsDir, file), "utf8");
      await pool.query(sql);
      console.log(`Migration completed: ${file}`);
    }
  } finally {
    await pool.end();
  }
}
