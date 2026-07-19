import "dotenv/config";
import { runMigrations } from "../src/database/runMigrations.js";

await runMigrations();
