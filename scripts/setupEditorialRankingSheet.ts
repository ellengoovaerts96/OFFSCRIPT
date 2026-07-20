import "dotenv/config";
import { google } from "googleapis";
import pg from "pg";

const SHEET_NAME = "Editorial Ranking";
const headers = [
  "timestamp", "place_name", "offscript_pick_level", "offscript_priority",
  "offscript_reason_nl", "offscript_reason_fr", "offscript_reason_en", "authenticity",
  "food_orientation", "audience_orientation", "audience_tags", "adventure_level",
  "occasion_tags", "work_friendly", "review_status", "verified_by", "review_notes"
] as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
}
function range(value: string): string { return `'${SHEET_NAME}'!${value}`; }
function key(value: unknown): string { return String(value ?? "").trim().toLowerCase(); }

async function main(): Promise<void> {
  const auth = new google.auth.JWT({
    email: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const pool = new pg.Pool({ connectionString: required("DATABASE_URL"), ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined });
  try {
    const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
    let sheet = metadata.data.sheets?.find((item) => item.properties?.title === SHEET_NAME);
    if (!sheet) {
      const added = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME, gridProperties: { frozenRowCount: 1 } } } }] } });
      sheet = added.data.replies?.[0].addSheet;
    }
    const sheetId = sheet?.properties?.sheetId;
    if (sheetId === undefined) throw new Error("Editorial Ranking sheet ID is unavailable.");

    const old = (await sheets.spreadsheets.values.get({ spreadsheetId, range: range("A1:Z") })).data.values ?? [];
    const oldHeaders = (old[0] ?? []).map(key);
    const oldByTimestamp = new Map<string, unknown[]>();
    const oldByName = new Map<string, unknown[]>();
    for (const row of old.slice(1)) {
      const timestamp = key(row[oldHeaders.indexOf("timestamp")]);
      const name = key(row[oldHeaders.indexOf("place_name")]);
      if (timestamp) oldByTimestamp.set(timestamp, row);
      if (name) oldByName.set(name, row);
    }
    const previous = (row: unknown[] | undefined, name: string): unknown => {
      if (!row) return "";
      let index = oldHeaders.indexOf(name);
      if (index < 0 && name === "audience_orientation") index = oldHeaders.indexOf("local_vs_western");
      return index >= 0 ? row[index] ?? "" : "";
    };

    const result = await pool.query(`SELECT raw.timestamp, p.name, p.offscript_pick_level, p.offscript_priority,
      p.offscript_reason_nl, p.offscript_reason_fr, p.offscript_reason_en, p.authenticity,
      p.food_orientation, p.audience_orientation, p.audience_tags, p.adventure_level,
      p.occasion_tags, p.work_friendly, p.editorial_review_status, p.editorial_verified_by, p.editorial_review_notes
      FROM public.places p LEFT JOIN public.field_research_raw raw ON raw.source_row_id = p.source_row_id
      WHERE p.status <> 'archived' ORDER BY p.name`);
    const values: unknown[][] = [[...headers]];
    for (const db of result.rows) {
      const timestamp = db.timestamp instanceof Date ? db.timestamp.toISOString() : String(db.timestamp ?? "");
      const oldRow = oldByTimestamp.get(key(timestamp)) ?? oldByName.get(key(db.name));
      const value = (name: string, fallback: unknown): unknown => previous(oldRow, name) !== "" ? previous(oldRow, name) : fallback ?? "";
      values.push([
        timestamp, db.name, value("offscript_pick_level", db.offscript_pick_level), value("offscript_priority", db.offscript_priority),
        value("offscript_reason_nl", db.offscript_reason_nl), value("offscript_reason_fr", db.offscript_reason_fr), value("offscript_reason_en", db.offscript_reason_en),
        value("authenticity", db.authenticity), value("food_orientation", db.food_orientation), value("audience_orientation", db.audience_orientation),
        value("audience_tags", (db.audience_tags ?? []).join(", ")), value("adventure_level", db.adventure_level),
        value("occasion_tags", (db.occasion_tags ?? []).filter((tag: string) => tag !== "quick_meal").join(", ")), value("work_friendly", db.work_friendly),
        value("review_status", db.editorial_review_status === "draft" ? "needs_review" : db.editorial_review_status),
        value("verified_by", db.editorial_verified_by), value("review_notes", db.editorial_review_notes)
      ]);
    }
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: range("A:Z") });
    await sheets.spreadsheets.values.update({ spreadsheetId, range: range(`A1:Q${values.length}`), valueInputOption: "RAW", requestBody: { values } });
    const validation = (columnIndex: number, allowed: string[]) => ({ setDataValidation: { range: { sheetId, startRowIndex: 1, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 }, rule: { condition: { type: "ONE_OF_LIST", values: allowed.map((userEnteredValue) => ({ userEnteredValue })) }, strict: true, showCustomUi: true } } });
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
      { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
      { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: { red: .20, green: .10, blue: .35 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: "userEnteredFormat" } },
      validation(2, ["0", "1", "2", "3"]), validation(7, ["0", "1", "2", "3", "4"]),
      validation(8, ["-2", "-1", "0", "1", "2"]), validation(9, ["-2", "-1", "0", "1", "2"]),
      validation(11, ["0", "1", "2", "3"]), validation(13, ["TRUE", "FALSE"]),
      validation(14, ["draft", "needs_review", "approved"])
    ] } });
    console.log(`Editorial Ranking updated: ${result.rowCount} places; existing review values preserved.`);
  } finally { await pool.end(); }
}
main().catch((error) => { console.error("Editorial Ranking sheet setup failed", error); process.exitCode = 1; });
