import "dotenv/config";
import { google } from "googleapis";
import pg from "pg";

const SHEET_NAME = "Editorial Ranking";
const dryRun = process.argv.includes("--dry-run");
function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is missing.`); return value; }
function normalized(value: unknown): string { return String(value ?? "").trim().toLowerCase(); }
function list(value: unknown): string[] { return String(value ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean).filter((item) => item !== "quick_meal"); }
function integer(value: unknown, min: number, max: number, field: string): number | null { if (String(value ?? "").trim() === "") return null; const number = Number(value); if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${field} must be an integer from ${min} to ${max}.`); return number; }
function bool(value: unknown): boolean | null { const text = normalized(value); if (!text) return null; if (["true", "yes", "ja", "oui", "1"].includes(text)) return true; if (["false", "no", "nee", "non", "0"].includes(text)) return false; throw new Error(`work_friendly must be TRUE, FALSE, or blank.`); }

async function main(): Promise<void> {
  const auth = new google.auth.JWT({ email: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"), key: required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"), scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const values = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${SHEET_NAME}'!A:Q` })).data.values ?? [];
  const headers = (values[0] ?? []).map(normalized);
  const index = (name: string): number => { const found = headers.indexOf(name); if (found < 0) throw new Error(`Missing Sheet column: ${name}`); return found; };
  const pool = new pg.Pool({ connectionString: required("DATABASE_URL"), ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined });
  const client = await pool.connect();
  let approved = 0;
  try {
    await client.query("BEGIN");
    for (const [offset, row] of values.slice(1).entries()) {
      if (normalized(row[index("review_status")]) !== "approved") continue;
      const timestamp = String(row[index("timestamp")] ?? "").trim();
      const placeName = String(row[index("place_name")] ?? "").trim();
      if (!timestamp || !placeName) { console.warn(`Skipping Sheet row ${offset + 2}: timestamp or place_name missing.`); continue; }
      const sourceRowId = `sheet-timestamp:${timestamp}`;
      const params = [
        integer(row[index("offscript_pick_level")], 0, 3, "offscript_pick_level") ?? 0,
        integer(row[index("offscript_priority")], 0, 100, "offscript_priority") ?? 0,
        row[index("offscript_reason_nl")] || null, row[index("offscript_reason_fr")] || null, row[index("offscript_reason_en")] || null,
        integer(row[index("authenticity")], 0, 4, "authenticity"), integer(row[index("food_orientation")], -2, 2, "food_orientation"),
        integer(row[index("audience_orientation")], -2, 2, "audience_orientation"), list(row[index("audience_tags")]),
        integer(row[index("adventure_level")], 0, 3, "adventure_level"), list(row[index("occasion_tags")]), bool(row[index("work_friendly")]),
        row[index("verified_by")] || null, row[index("review_notes")] || null, sourceRowId, placeName
      ];
      const result = await client.query(`UPDATE public.places SET offscript_pick_level=$1, offscript_priority=$2,
        offscript_reason_nl=$3, offscript_reason_fr=$4, offscript_reason_en=$5, authenticity=$6,
        food_orientation=$7, audience_orientation=$8, audience_tags=$9, adventure_level=$10,
        occasion_tags=$11, work_friendly=$12, editorial_review_status='approved', editorial_verified_by=$13,
        editorial_review_notes=$14, editorial_verified_at=NOW(), updated_at=NOW()
        WHERE source_row_id=$15 OR (source_row_id IS NULL AND lower(name)=lower($16))`, params);
      if (result.rowCount !== 1) throw new Error(`Sheet row ${offset + 2} (${placeName}) matched ${result.rowCount} places; expected exactly one.`);
      approved++;
    }
    if (dryRun) await client.query("ROLLBACK"); else await client.query("COMMIT");
    console.log(`${dryRun ? "Dry run" : "Sync"} complete: ${approved} approved editorial rows ${dryRun ? "validated" : "updated"}.`);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error("Editorial ranking sync failed", error); process.exitCode = 1; });
