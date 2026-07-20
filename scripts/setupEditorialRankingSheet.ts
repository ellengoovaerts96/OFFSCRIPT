import "dotenv/config";
import { google } from "googleapis";
import pg from "pg";

const { Pool } = pg;
const SHEET_NAME = "Editorial Ranking";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const headers = [
  "timestamp",
  "place_name",
  "offscript_pick_level",
  "offscript_priority",
  "offscript_reason_nl",
  "offscript_reason_fr",
  "authenticity",
  "local_vs_western",
  "occasion_tags",
  "quick_meal",
  "work_friendly",
  "review_status",
  "verified_by",
  "review_notes"
] as const;

type EditorialPlaceRow = {
  timestamp: Date | null;
  name: string;
  offscript_pick_level: number;
  offscript_priority: number;
  offscript_reason_nl: string | null;
  offscript_reason_fr: string | null;
  authenticity: number | null;
  local_vs_western: number | null;
  occasion_tags: string[] | null;
  quick_meal: boolean | null;
  work_friendly: boolean | null;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
}

function sheetRange(range: string): string {
  return `'${SHEET_NAME.replaceAll("'", "''")}'!${range}`;
}

function optionalValue(value: string | number | boolean | null): string | number | boolean {
  return value ?? "";
}

async function main(): Promise<void> {
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const spreadsheetId = requiredEnvironment("GOOGLE_SHEETS_SPREADSHEET_ID");
  const email = requiredEnvironment("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const key = requiredEnvironment("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({ email, key, scopes: [GOOGLE_SHEETS_SCOPE] });
  const sheets = google.sheets({ version: "v4", auth });
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
  });

  try {
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties"
    });
    const existingSheet = metadata.data.sheets?.find(
      (sheet) => sheet.properties?.title === SHEET_NAME
    );

    if (!existingSheet) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: SHEET_NAME,
                gridProperties: { frozenRowCount: 1 }
              }
            }
          }]
        }
      });
    } else {
      const existingValues = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: sheetRange("A2:N")
      });
      if ((existingValues.data.values ?? []).some((row) => row.some((value) => String(value).trim()))) {
        throw new Error(`Sheet "${SHEET_NAME}" already contains data; refusing to overwrite it.`);
      }
    }

    const result = await pool.query<EditorialPlaceRow>(`
      SELECT
        raw.timestamp,
        p.name,
        p.offscript_pick_level,
        p.offscript_priority,
        p.offscript_reason_nl,
        p.offscript_reason_fr,
        p.authenticity,
        p.local_vs_western,
        p.occasion_tags,
        p.quick_meal,
        p.work_friendly
      FROM public.places p
      LEFT JOIN public.field_research_raw raw
        ON raw.source_row_id = p.source_row_id
      WHERE p.status <> 'archived'
      ORDER BY p.name
    `);

    const values = [
      [...headers],
      ...result.rows.map((row) => [
        row.timestamp?.toISOString() ?? "",
        row.name,
        row.offscript_pick_level,
        row.offscript_priority,
        optionalValue(row.offscript_reason_nl),
        optionalValue(row.offscript_reason_fr),
        optionalValue(row.authenticity),
        optionalValue(row.local_vs_western),
        (row.occasion_tags ?? []).join(", "),
        optionalValue(row.quick_meal),
        optionalValue(row.work_friendly),
        "needs_review",
        "",
        ""
      ])
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetRange(`A1:N${values.length}`),
      valueInputOption: "RAW",
      requestBody: { values }
    });

    console.log(`Editorial Ranking sheet ready with ${result.rowCount} places.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Editorial Ranking sheet setup failed", error);
  process.exitCode = 1;
});
