import "dotenv/config";
import { createHash } from "node:crypto";
import { google } from "googleapis";
import { zodTextFormat } from "openai/helpers/zod";
import pg, { type PoolClient } from "pg";
import { z } from "zod";
import { getOpenAIClient, openaiModel } from "../src/integrations/openai.js";

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
  "short_description_en",
  "short_description_fr",
  "practical_info",
  "practical_info_en",
  "practical_info_fr",
  "personal_tip",
  "personal_tip_en",
  "personal_tip_fr",
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
  "story_en",
  "story_fr",
  "transport",
  "entry_type",
  "food_orientation",
  "paid_experience_later",
  "experience_idea",
  "update_notes",
  "translation_source_hash",
  "translation_status",
  "translation_updated_at"
] as const;

type DatabaseColumn = (typeof databaseColumns)[number];
type SheetValue = string | number | boolean | null;

type SourceRow = {
  sheetRowNumber: number;
  sourceRowId: string;
  values: Map<DatabaseColumn, SheetValue>;
};

type ExistingTranslation = {
  source_row_id: string;
  short_description_fr: string | null;
  practical_info_fr: string | null;
  personal_tip_fr: string | null;
  story_fr: string | null;
  translation_source_hash: string | null;
  translation_status: string | null;
  translation_updated_at: Date | null;
};

const englishContentColumns = [
  "short_description_en",
  "practical_info_en",
  "personal_tip_en",
  "story_en"
] as const satisfies readonly DatabaseColumn[];

const frenchContentColumns = [
  "short_description_fr",
  "practical_info_fr",
  "personal_tip_fr",
  "story_fr"
] as const satisfies readonly DatabaseColumn[];

const translationMetadataColumns = [
  "translation_source_hash",
  "translation_status",
  "translation_updated_at"
] as const satisfies readonly DatabaseColumn[];

const translationBatchSchema = z.object({
  translations: z.array(z.object({
    sourceRowId: z.string(),
    shortDescriptionFr: z.string().nullable(),
    practicalInfoFr: z.string().nullable(),
    personalTipFr: z.string().nullable(),
    storyFr: z.string().nullable()
  }))
});

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
    source_raw_id: "source_row_id",
    source_row: "source_row_id",
    timestamp: "timestamp",
    time_stamp: "timestamp",
    place_name: "place",
    name_of_place: "place",
    name_of_place_story_experience: "place",
    type_of_entry: "entry_type",
    city: "region",
    region: "neighbourhood",
    neighbourhood_exact_area: "area",
    photo_1: "image_1",
    photo_2: "image_2",
    photo_3: "image_3",
    practical_info: "practical_info_en",
    google_maps_link: "google_maps_url",
    category: "categories",
    subcategory: "subcategories",
    short_description: "short_description_en",
    personal_tip: "personal_tip_en",
    food_orientation: "food_orientation",
    vibe: "vibe",
    best_time_to_go: "best_timing",
    good_for: "traveller_types",
    is_it_child_friendly: "child_friendly",
    contact_person: "contact_person",
    phone_whatsapp_contact: "phone",
    transport_notes: "transport",
    safety_comfort_notes: "safety_notes",
    price_indication: "price_level",
    story: "story_en",
    could_this_become_a_paid_experience_later: "paid_experience_later",
    experience_idea: "experience_idea",
    update: "update_notes",
    fb: "facebook_url",
    instagram: "instagram_url",
    tiktok: "tiktok_url",
    country: "country"
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

function textValue(row: SourceRow, column: DatabaseColumn): string | null {
  const value = row.values.get(column);
  return value === undefined || value === null || String(value).trim() === ""
    ? null
    : String(value).trim();
}

function translationHash(row: SourceRow): string {
  return createHash("sha256")
    .update(JSON.stringify(englishContentColumns.map((column) => textValue(row, column))))
    .digest("hex");
}

function applyExistingTranslation(
  row: SourceRow,
  existing: ExistingTranslation,
  sourceHash: string,
  status = existing.translation_status ?? "auto"
): void {
  row.values.set("short_description_fr", existing.short_description_fr);
  row.values.set("practical_info_fr", existing.practical_info_fr);
  row.values.set("personal_tip_fr", existing.personal_tip_fr);
  row.values.set("story_fr", existing.story_fr);
  row.values.set("translation_source_hash", sourceHash);
  row.values.set("translation_status", status);
  row.values.set("translation_updated_at", existing.translation_updated_at?.toISOString() ?? null);
}

async function translateChangedRows(client: PoolClient, rows: SourceRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const existingResult = await client.query<ExistingTranslation>(`
    SELECT
      source_row_id,
      short_description_fr,
      practical_info_fr,
      personal_tip_fr,
      story_fr,
      translation_source_hash,
      translation_status,
      translation_updated_at
    FROM public.field_research_raw
    WHERE source_row_id = ANY($1::text[])
  `, [rows.map((row) => row.sourceRowId)]);
  const existingBySourceId = new Map(
    existingResult.rows.map((row) => [row.source_row_id, row])
  );
  const pending: SourceRow[] = [];

  for (const row of rows) {
    const hash = translationHash(row);
    const existing = existingBySourceId.get(row.sourceRowId);
    const hasEnglishContent = englishContentColumns.some((column) => textValue(row, column));

    if (!hasEnglishContent) {
      frenchContentColumns.forEach((column) => row.values.set(column, null));
      row.values.set("translation_source_hash", hash);
      row.values.set("translation_status", "not_required");
      row.values.set("translation_updated_at", null);
      continue;
    }

    if (existing?.translation_source_hash === hash) {
      applyExistingTranslation(row, existing, hash);
      continue;
    }

    if (existing?.translation_status?.startsWith("manual")) {
      applyExistingTranslation(row, existing, hash, "manual_review_required");
      continue;
    }

    pending.push(row);
  }

  if (pending.length === 0) return 0;
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required to generate missing or outdated French translations.");
  }

  const openai = getOpenAIClient();
  const translatedAt = new Date().toISOString();

  for (let offset = 0; offset < pending.length; offset += 10) {
    const batch = pending.slice(offset, offset + 10);
    const response = await openai.responses.parse({
      model: openaiModel,
      instructions: `Translate the supplied OFFSCRIPT field-research content from English to natural French for travellers in Senegal.
Rules:
- Translate only the supplied text; do not add or remove facts.
- Preserve place names, local names, URLs, phone numbers, prices, opening hours, emojis, lists and line breaks.
- Keep the tone warm, concise and locally respectful.
- Return null when the source field is null.
- Return exactly one result for every sourceRowId.`,
      input: JSON.stringify(batch.map((row) => ({
        sourceRowId: row.sourceRowId,
        shortDescriptionEn: textValue(row, "short_description_en"),
        practicalInfoEn: textValue(row, "practical_info_en"),
        personalTipEn: textValue(row, "personal_tip_en"),
        storyEn: textValue(row, "story_en")
      }))),
      text: {
        format: zodTextFormat(translationBatchSchema, "field_research_translations")
      }
    });
    const translations = response.output_parsed?.translations;
    if (!translations || translations.length !== batch.length) {
      throw new Error(`OpenAI returned ${translations?.length ?? 0} translations for a batch of ${batch.length}.`);
    }
    const bySourceId = new Map(translations.map((translation) => [translation.sourceRowId, translation]));

    for (const row of batch) {
      const translation = bySourceId.get(row.sourceRowId);
      if (!translation) {
        throw new Error(`OpenAI omitted translation for ${row.sourceRowId}.`);
      }
      row.values.set("short_description_fr", translation.shortDescriptionFr?.trim() || null);
      row.values.set("practical_info_fr", translation.practicalInfoFr?.trim() || null);
      row.values.set("personal_tip_fr", translation.personalTipFr?.trim() || null);
      row.values.set("story_fr", translation.storyFr?.trim() || null);
      row.values.set("translation_source_hash", translationHash(row));
      row.values.set("translation_status", "auto");
      row.values.set("translation_updated_at", translatedAt);
    }
  }

  return pending.length;
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
): Promise<{ changedRows: number; removedLegacyDuplicates: number }> {
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

  await client.query(`
    UPDATE public.places AS place
    SET
      short_description_en = raw.short_description_en,
      short_description_fr = raw.short_description_fr,
      practical_info_en = raw.practical_info_en,
      practical_info_fr = raw.practical_info_fr,
      personal_tip_en = raw.personal_tip_en,
      personal_tip_fr = raw.personal_tip_fr,
      story_en = raw.story_en,
      story_fr = raw.story_fr
    FROM public.field_research_raw AS raw
    WHERE raw.source_row_id = ANY($1::text[])
      AND raw.place IS NOT NULL
      AND lower(btrim(place.name)) = lower(btrim(raw.place))
  `, [rows.map((row) => row.sourceRowId)]);

  const cleanupResult = await client.query(`
    DELETE FROM public.field_research_raw AS legacy
    USING public.field_research_raw AS synced
    WHERE legacy.source_row_id IS NULL
      AND synced.source_row_id LIKE 'sheet-timestamp:%'
      AND legacy.place IS NOT NULL
      AND synced.place IS NOT NULL
      AND lower(btrim(legacy.place)) = lower(btrim(synced.place))
  `);

  return {
    changedRows,
    removedLegacyDuplicates: cleanupResult.rowCount ?? 0
  };
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
  const timestampIndex = mappedHeaders.indexOf("timestamp");
  if (timestampIndex === -1) {
    throw new Error(`Sheet "${SHEET_NAME}" must contain a Timestamp column.`);
  }

  const mappedColumns = databaseColumns.filter((column) => mappedHeaders.includes(column));
  if (!mappedColumns.includes("place")) {
    throw new Error(`Sheet "${SHEET_NAME}" must contain the "Name of place/story/experience" column.`);
  }
  const ignoredHeaders = headers.filter((header, index) => header.trim() && !mappedHeaders[index]);
  if (ignoredHeaders.length > 0) {
    console.warn(`Ignoring unmapped Sheet columns: ${ignoredHeaders.join(", ")}`);
  }

  const rowsBySourceId = new Map<string, SourceRow>();
  for (let index = 1; index < sheetRows.length; index += 1) {
    const sheetRow = sheetRows[index];
    const sheetRowNumber = index + 1;

    const values = new Map<DatabaseColumn, SheetValue>();
    mappedHeaders.forEach((column, columnIndex) => {
      if (!column || column === "source_row_id") return;
      let value = normalizeCell(sheetRow[columnIndex]);
      if (column === "timestamp") value = normalizeTimestamp(value, spreadsheetLocale);
      values.set(column, value);
    });

    // Keep legacy English columns populated while n8n's downstream processor
    // is being phased out. New bilingual consumers use the suffixed columns.
    values.set("short_description", values.get("short_description_en") ?? null);
    values.set("practical_info", values.get("practical_info_en") ?? null);
    values.set("personal_tip", values.get("personal_tip_en") ?? null);
    values.set("story", values.get("story_en") ?? null);

    const timestamp = values.get("timestamp") ?? normalizeTimestamp(
      normalizeCell(sheetRow[timestampIndex]),
      spreadsheetLocale
    );
    if (timestamp === null || String(timestamp).trim() === "") {
      console.warn(`Skipping Sheet row ${sheetRowNumber}: Timestamp is missing.`);
      continue;
    }

    const place = values.get("place");
    if (place === null || place === undefined || String(place).trim() === "") {
      console.warn(`Skipping Sheet row ${sheetRowNumber}: Name of place/story/experience is missing.`);
      continue;
    }

    // Google Form timestamps are immutable for a response and form the real
    // source identity. Keep the database upsert contract on source_row_id while
    // avoiding a second ID column that has to be maintained in the Sheet.
    const sourceRowId = `sheet-timestamp:${String(timestamp)}`;

    if (rowsBySourceId.has(sourceRowId)) {
      console.warn(`Duplicate Timestamp "${timestamp}" in Sheet; keeping row ${sheetRowNumber}.`);
    }
    rowsBySourceId.set(sourceRowId, { sheetRowNumber, sourceRowId, values });
  }

  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
  });
  const client = await pool.connect();

  try {
    const rows = [...rowsBySourceId.values()];
    const translatedRows = await translateChangedRows(client, rows);
    const syncColumns = databaseColumns.filter((column) =>
      mappedColumns.includes(column)
      || [
        "short_description",
        "practical_info",
        "personal_tip",
        "story",
        ...frenchContentColumns,
        ...translationMetadataColumns
      ].includes(column)
    );
    const { changedRows, removedLegacyDuplicates } = await syncRows(
      client,
      rows,
      syncColumns,
      spreadsheetTimeZone
    );

    if (dryRun) {
      await client.query("ROLLBACK");
      console.log(`Dry run complete: ${rowsBySourceId.size} unique rows checked; ${translatedRows} French translations generated; ${changedRows} rows would be inserted or updated; ${removedLegacyDuplicates} legacy duplicates would be removed.`);
    } else {
      await client.query("COMMIT");
      console.log(`Sync complete: ${rowsBySourceId.size} unique rows checked; ${translatedRows} French translations generated; ${changedRows} rows inserted or updated; ${removedLegacyDuplicates} legacy duplicates removed.`);
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
