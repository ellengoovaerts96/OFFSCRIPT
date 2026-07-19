import "dotenv/config";
import { runMigrations } from "./database/runMigrations.js";

try {
  await runMigrations();
} catch (error) {
  console.error("Database migration failed", error);
  process.exitCode = 1;
}
