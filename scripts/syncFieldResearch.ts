import "dotenv/config";
import { google } from "googleapis";
import pg, { type PoolClient } from "pg";

const SHEET_NAME = "Form responses 1";
const GOOGLE_SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

const databaseColumns = [
  "timestamp",
  "place",
  "country",
  "region",
  "neighbourhood",
  "area",
  "short_description",
  "practical_info",
  "personal_tip",
  "why_hidden_gem",
  "traveller_types",
  "child_friendly",
  "best_timing",
  "price_level",
  "google_maps_url",
  "safety_notes",
  "categories",
  "subcategories",
  "vibe",
  "facebook_url",
  "instagram_url",
  "tiktok_url",
  "image_1",
  "image_2",
  "image_3",
  "contact_person",
  "phone",
  "story",
  "transport",
  "entry_type"
] as const;

type DatabaseColumn = (typeof databaseColumns)[number];
type SheetValue = string | number | boolean | null;

type SourceRow = {
  sheetRowNumber: number;
  sourceRowId: string;
  values: Map<DatabaseColumn, SheetValue>;
};

const requiredEnvironmentVariables = [
  "DATABASE_URL",
  "GOOGLE_SHEETS_SPREADSHEET_ID",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY"
] as const;

function requireEnvironment(): Record<(typeof requiredEnvironmentVariables)[number], string> {
  const missing = requiredEnvironmentVariables.filter((name) => !process.env[name]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return Object.fromEntries(
    requiredEnvironmentVariables.map((name) => [name, process.env[name]!.trim()])
  ) as Record<(typeof requiredEnvironmentVariables)[number], string>;
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function columnForHeader(header: string): DatabaseColumn | "source_row_id" | undefined {
  const normalized = normalizeHeader(header);
  const aliases: Record<string, DatabaseColumn | "source_row_id"> = {
    source_row_id: "source_row_id",
    source_row: "source_row_id",
    timestamp: "timestamp",
    time_stamp: "timestamp",
    place_name: "place",
    name_of_place: "place"
  };

  const alias = aliases[normalized];
  if (alias) return alias;
  if ((databaseColumns as readonly string[]).includes(normalized)) return normalized as DatabaseColumn;
  return undefined;
}

function normalizeCell(value: unknown): SheetValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function normalizeTimestamp(value: SheetValue, spreadsheetLocale: string): SheetValue {
  if (typeof value !== "string") return value;
  const match = value.match(
    /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) return value;

  const [, first, second, year, hour = "0", minute = "0", secondPart = "0"] = match;
  const monthFirst = spreadsheetLocale.toLowerCase().replace("-", "_") === "en_us";
  const month = monthFirst ? first : second;
  const day = monthFirst ? second : first;

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:${secondPart}`;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function buildUpsertQuery(columns: DatabaseColumn[]): string {
  const insertColumns = ["source_row_id", ...columns, "processed"];
  const placeholders = insertColumns.map((_, index) => `$${index + 1}`);
  const comparedColumns = columns.map(quoteIdentifier);
  const assignments = [
    ...columns.map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`),
    "processed = false"
  ];
  const changeCondition = comparedColumns.length
    ? `WHERE (${comparedColumns.map((column) => `field_research_raw.${column}`).join(", ")}) IS DISTINCT FROM (${comparedColumns.map((column) => `EXCLUDED.${column}`).join(", ")})`
    : "WHERE false";

  return `
    INSERT INTO public.field_research_raw (${insertColumns.map(quoteIdentifier).join(", ")})
    VALUES (${placeholders.join(", ")})
    ON CONFLICT (source_row_id) DO UPDATE SET
      ${assignments.join(",\n      ")}
    ${changeCondition}
    RETURNING id
  `;
}

async function syncRows(
  client: PoolClient,
  rows: SourceRow[],
  mappedColumns: DatabaseColumn[],
  spreadsheetTimeZone: string
): Promise<number> {
  await client.query("BEGIN");
  await client.query("SELECT set_config('TimeZone', $1, true)", [spreadsheetTimeZone]);

  const query = buildUpsertQuery(mappedColumns);
  let changedRows = 0;

  for (const row of rows) {
    const values = [
      row.sourceRowId,
      ...mappedColumns.map((column) => row.values.get(column) ?? null),
      false
    ];
    const result = await client.query(query, values);
    changedRows += result.rowCount ?? 0;
  }

  return changedRows;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--dry-run");
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}. Supported: --dry-run`);
  }

  const env = requireEnvironment();
  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: [GOOGLE_SHEETS_READONLY_SCOPE]
  });
  const sheets = google.sheets({ version: "v4", auth });

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
    fields: "properties(locale,timeZone)"
  });
  const spreadsheetLocale = spreadsheet.data.properties?.locale ?? "en_US";
  const spreadsheetTimeZone = spreadsheet.data.properties?.timeZone ?? "UTC";
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `'${SHEET_NAME.replaceAll("'", "''")}'`,
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING"
  });

  const sheetRows = response.data.values ?? [];
  if (sheetRows.length === 0) {
    console.log(`Sheet "${SHEET_NAME}" is empty; nothing to sync.`);
    return;
  }

  const headers = sheetRows[0].map((value) => String(value));
  const mappedHeaders = headers.map(columnForHeader);
  const sourceRowIdIndex = mappedHeaders.indexOf("source_row_id");
  if (sourceRowIdIndex === -1) {
    throw new Error(`Sheet "${SHEET_NAME}" must contain a source_row_id column.`);
  }

  const mappedColumns = databaseColumns.filter((column) => mappedHeaders.includes(column));
  const ignoredHeaders = headers.filter((header, index) => header.trim() && !mappedHeaders[index]);
  if (ignoredHeaders.length > 0) {
    console.warn(`Ignoring unmapped Sheet columns: ${ignoredHeaders.join(", ")}`);
  }

  const rowsBySourceId = new Map<string, SourceRow>();
  for (let index = 1; index < sheetRows.length; index += 1) {
    const sheetRow = sheetRows[index];
    const sourceRowIdValue = normalizeCell(sheetRow[sourceRowIdIndex]);
    const sourceRowId = sourceRowIdValue === null ? "" : String(sourceRowIdValue).trim();
    const sheetRowNumber = index + 1;

    if (!sourceRowId) {
      console.warn(`Skipping Sheet row ${sheetRowNumber}: source_row_id is missing.`);
      continue;
    }

    const values = new Map<DatabaseColumn, SheetValue>();
    mappedHeaders.forEach((column, columnIndex) => {
      if (!column || column === "source_row_id") return;
      let value = normalizeCell(sheetRow[columnIndex]);
      if (column === "timestamp") value = normalizeTimestamp(value, spreadsheetLocale);
      values.set(column, value);
    });

    if (rowsBySourceId.has(sourceRowId)) {
      console.warn(`Duplicate source_row_id "${sourceRowId}" in Sheet; keeping row ${sheetRowNumber}.`);
    }
    rowsBySourceId.set(sourceRowId, { sheetRowNumber, sourceRowId, values });
  }

  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
  });
  const client = await pool.connect();

  try {
    const changedRows = await syncRows(
      client,
      [...rowsBySourceId.values()],
      mappedColumns,
      spreadsheetTimeZone
    );

    if (dryRun) {
      await client.query("ROLLBACK");
      console.log(`Dry run complete: ${rowsBySourceId.size} unique rows checked; ${changedRows} would be inserted or updated.`);
    } else {
      await client.query("COMMIT");
      console.log(`Sync complete: ${rowsBySourceId.size} unique rows checked; ${changedRows} inserted or updated.`);
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Field research sync failed: ${message}`);
  process.exitCode = 1;
});
