import "dotenv/config";
import { auth as googleAuth, sheets as createSheetsClient } from "googleapis/build/src/apis/sheets/index.js";
import { zodTextFormat } from "openai/helpers/zod";
import pg from "pg";
import { z } from "zod";
import { getOpenAIClient, openaiModel } from "../src/integrations/openai.js";
import { PLACE_AMENITIES } from "../src/types/place.js";

const SHEET_NAME = "Editorial Ranking";
const dryRun = process.argv.includes("--dry-run");
const GOOGLE_REQUEST_TIMEOUT_MS = 20_000;
const DATABASE_CONNECTION_TIMEOUT_MS = 15_000;
const reasonTranslationSchema = z.object({
  translations: z.array(z.object({
    sheetRow: z.number().int(),
    english: z.string(),
    french: z.string()
  }))
});
type ReasonTranslation = z.infer<typeof reasonTranslationSchema>["translations"][number];
type ExistingReason = {
  name: string;
  offscript_reason_en: string | null;
  offscript_reason_fr: string | null;
  editorial_locked_fields: string[] | null;
};
function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is missing.`); return value; }
function normalized(value: unknown): string { return String(value ?? "").trim().toLowerCase(); }
function text(value: unknown): string | null { const result = String(value ?? "").trim(); return result || null; }
function list(value: unknown): string[] { return String(value ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean).filter((item) => item !== "quick_meal"); }
function amenityList(value: unknown): string[] {
  const amenities = list(value).map((item) => item.replace(/\s+/g, "_"));
  const allowed = new Set<string>(PLACE_AMENITIES);
  const invalid = amenities.filter((item) => !allowed.has(item));
  if (invalid.length) throw new Error(`Unknown amenities: ${invalid.join(", ")}.`);
  return [...new Set(amenities)];
}
function audienceList(value: unknown): string[] {
  const aliases: Record<string, string> = {
    local: "residents", locals: "residents", resident: "residents", residents: "residents",
    african_expat: "expats", african_expats: "expats",
    international_expat: "expats", international_expats: "expats", expat: "expats", expats: "expats"
  };
  return [...new Set(list(value).map((item) => aliases[item.replace(/\s+/g, "_")] ?? item.replace(/\s+/g, "_")))];
}
function integer(value: unknown, min: number, max: number, field: string): number | null { if (String(value ?? "").trim() === "") return null; const number = Number(value); if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${field} must be an integer from ${min} to ${max}.`); return number; }
function bool(value: unknown): boolean | null { const text = normalized(value); if (!text) return null; if (["true", "yes", "ja", "oui", "1"].includes(text)) return true; if (["false", "no", "nee", "non", "0"].includes(text)) return false; throw new Error(`work_friendly must be TRUE, FALSE, or blank.`); }

async function translateReasons(
  requests: Array<{ sheetRow: number; dutch: string }>
): Promise<Map<number, ReasonTranslation>> {
  if (requests.length === 0) return new Map();
  required("OPENAI_API_KEY");

  const translations = new Map<number, ReasonTranslation>();
  const openai = getOpenAIClient();

  for (let offset = 0; offset < requests.length; offset += 10) {
    const batch = requests.slice(offset, offset + 10);
    const response = await openai.responses.parse({
      model: openaiModel,
      instructions: `Translate each Dutch OFFSCRIPT editorial reason into natural English and French.
Rules:
- Preserve every fact, place name and nuance.
- Do not add claims, advice or promotional language.
- Keep the warm tone of a local friend.
- Return exactly one translation for every supplied sheetRow.`,
      input: JSON.stringify(batch),
      text: {
        format: zodTextFormat(reasonTranslationSchema, "editorial_reason_translations")
      }
    });
    const translatedBatch = response.output_parsed?.translations;
    if (!translatedBatch || translatedBatch.length !== batch.length) {
      throw new Error(`OpenAI returned ${translatedBatch?.length ?? 0} editorial translations for ${batch.length} rows.`);
    }
    for (const translation of translatedBatch) translations.set(translation.sheetRow, translation);
  }

  return translations;
}

async function main(): Promise<void> {
  console.log(`Editorial-ranking sync starting in ${dryRun ? "read-only dry-run" : "write"} mode.`);
  const auth = new googleAuth.JWT({ email: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"), key: required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"), scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = createSheetsClient({ version: "v4", auth });
  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  console.log(`Reading Google Sheet tab "${SHEET_NAME}"...`);
  const values = (await sheets.spreadsheets.values.get(
    { spreadsheetId, range: `'${SHEET_NAME}'!A:S` },
    { timeout: GOOGLE_REQUEST_TIMEOUT_MS }
  )).data.values ?? [];
  const headers = (values[0] ?? []).map(normalized);
  const index = (name: string): number => { const found = headers.indexOf(name); if (found < 0) throw new Error(`Missing Sheet column: ${name}`); return found; };
  const optionalIndex = (name: string): number => headers.indexOf(name);
  console.log(`Google Sheet loaded: ${Math.max(values.length - 1, 0)} data rows. Connecting to PostgreSQL...`);
  const pool = new pg.Pool({
    connectionString: required("DATABASE_URL"),
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS
  });
  const client = await pool.connect();
  let approved = 0;
  try {
    const existingResult = await client.query<ExistingReason>(`
      SELECT name, offscript_reason_en, offscript_reason_fr, editorial_locked_fields
      FROM public.places
    `);
    const existingByName = new Map(existingResult.rows.map((place) => [normalized(place.name), place]));
    const pendingTranslations = values.slice(1).flatMap((row, offset) => {
      if (normalized(row[index("review_status")]) !== "approved") return [];
      const placeName = text(row[index("place_name")]);
      const reasonNl = text(row[index("offscript_reason_nl")]);
      if (!placeName || !reasonNl) return [];
      const existing = existingByName.get(normalized(placeName));
      const locked = new Set(existing?.editorial_locked_fields ?? []);
      const hasEnglish = locked.has("offscript_reason_en") || Boolean(text(row[index("offscript_reason_en")]) ?? existing?.offscript_reason_en);
      const hasFrench = locked.has("offscript_reason_fr") || Boolean(text(row[index("offscript_reason_fr")]) ?? existing?.offscript_reason_fr);
      return hasEnglish && hasFrench ? [] : [{ sheetRow: offset + 2, dutch: reasonNl }];
    });
    const reasonTranslations = dryRun
      ? new Map<number, ReasonTranslation>()
      : await translateReasons(pendingTranslations);

    console.log(`PostgreSQL connected. Validating ${values.slice(1).filter((row) => normalized(row[index("review_status")]) === "approved").length} approved editorial rows...`);
    if (!dryRun) await client.query("BEGIN");
    for (const [offset, row] of values.slice(1).entries()) {
      if (normalized(row[index("review_status")]) !== "approved") continue;
      const timestamp = String(row[index("timestamp")] ?? "").trim();
      const placeName = String(row[index("place_name")] ?? "").trim();
      if (!timestamp || !placeName) { console.warn(`Skipping Sheet row ${offset + 2}: timestamp or place_name missing.`); continue; }
      const sourceRowId = `sheet-timestamp:${timestamp}`;
      const existing = existingByName.get(normalized(placeName));
      const translation = reasonTranslations.get(offset + 2);
      const reasonNl = text(row[index("offscript_reason_nl")]);
      const reasonEn = text(row[index("offscript_reason_en")]) ?? existing?.offscript_reason_en ?? translation?.english ?? null;
      const reasonFr = text(row[index("offscript_reason_fr")]) ?? existing?.offscript_reason_fr ?? translation?.french ?? null;
      const params = [
        integer(row[index("offscript_pick_level")], 0, 3, "offscript_pick_level") ?? 0,
        integer(row[index("offscript_priority")], 0, 100, "offscript_priority") ?? 0,
        integer(row[index("price_level")], 1, 5, "price_level"),
        reasonNl, reasonFr, reasonEn,
        integer(row[index("authenticity")], 0, 4, "authenticity"), integer(row[index("food_orientation")], -2, 2, "food_orientation"),
        integer(row[index("audience_orientation")], -2, 2, "audience_orientation"), audienceList(row[index("audience_tags")]),
        integer(row[index("adventure_level")], 0, 3, "adventure_level"), list(row[index("occasion_tags")]), bool(row[index("work_friendly")]),
        optionalIndex("amenities") >= 0 && text(row[optionalIndex("amenities")])
          ? amenityList(row[optionalIndex("amenities")])
          : null,
        row[index("verified_by")] || null, row[index("review_notes")] || null, sourceRowId, placeName
      ];
      const result = dryRun
        ? await client.query(
          `SELECT id FROM public.places
           WHERE source_row_id=$1 OR lower(btrim(name))=lower(btrim($2))`,
          [sourceRowId, placeName]
        )
        : await client.query(`UPDATE public.places SET
          offscript_pick_level=CASE WHEN NOT ('offscript_pick_level'=ANY(editorial_locked_fields)) THEN $1 ELSE offscript_pick_level END,
          offscript_priority=CASE WHEN NOT ('offscript_priority'=ANY(editorial_locked_fields)) THEN $2 ELSE offscript_priority END,
          price_level=CASE WHEN NOT ('price_level'=ANY(editorial_locked_fields)) THEN $3 ELSE price_level END,
          offscript_reason_nl=CASE WHEN NOT ('offscript_reason_nl'=ANY(editorial_locked_fields)) THEN $4 ELSE offscript_reason_nl END,
          offscript_reason_fr=CASE WHEN NOT ('offscript_reason_fr'=ANY(editorial_locked_fields)) THEN $5 ELSE offscript_reason_fr END,
          offscript_reason_en=CASE WHEN NOT ('offscript_reason_en'=ANY(editorial_locked_fields)) THEN $6 ELSE offscript_reason_en END,
          authenticity=CASE WHEN NOT ('authenticity'=ANY(editorial_locked_fields)) THEN $7 ELSE authenticity END,
          food_orientation=CASE WHEN NOT ('food_orientation'=ANY(editorial_locked_fields)) THEN $8 ELSE food_orientation END,
          audience_orientation=CASE WHEN NOT ('audience_orientation'=ANY(editorial_locked_fields)) THEN $9 ELSE audience_orientation END,
          audience_tags=CASE WHEN NOT ('audience_tags'=ANY(editorial_locked_fields)) THEN $10 ELSE audience_tags END,
          adventure_level=CASE WHEN NOT ('adventure_level'=ANY(editorial_locked_fields)) THEN $11 ELSE adventure_level END,
          occasion_tags=CASE WHEN NOT ('occasion_tags'=ANY(editorial_locked_fields)) THEN $12 ELSE occasion_tags END,
          work_friendly=CASE WHEN NOT ('work_friendly'=ANY(editorial_locked_fields)) THEN $13 ELSE work_friendly END,
          amenities=CASE WHEN NOT ('amenities'=ANY(editorial_locked_fields)) THEN COALESCE($14::text[], amenities) ELSE amenities END,
          editorial_review_status='approved', editorial_verified_by=$15,
          editorial_review_notes=$16, editorial_verified_at=NOW(), updated_at=NOW()
          WHERE source_row_id=$17 OR lower(btrim(name))=lower(btrim($18))`, params);
      if (result.rowCount !== 1) throw new Error(`Sheet row ${offset + 2} (${placeName}) matched ${result.rowCount} places; expected exactly one.`);
      approved++;
    }
    if (!dryRun) await client.query("COMMIT");
    const translationSummary = dryRun
      ? `${pendingTranslations.length} reasons require translation`
      : `${reasonTranslations.size} reasons translated`;
    console.log(`${dryRun ? "Dry run" : "Sync"} complete: ${approved} approved editorial rows ${dryRun ? "validated" : "updated"}; ${translationSummary}.`);
  } catch (error) { if (!dryRun) await client.query("ROLLBACK"); throw error; } finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error("Editorial ranking sync failed", error); process.exitCode = 1; });
