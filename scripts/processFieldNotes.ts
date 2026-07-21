import "dotenv/config";
import { google } from "googleapis";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient, openaiModel } from "../src/integrations/openai.js";

const FIELD_NOTES_SHEET = "Field Notes";
const STRUCTURED_SHEET = "Structured Import";
const dryRun = process.argv.includes("--dry-run");

const headers = [
  "source_note_id", "source_timestamp", "researcher", "place_name", "entry_type",
  "country", "region", "neighbourhood", "area", "categories", "subcategories",
  "short_description_en", "short_description_fr", "practical_info_en", "practical_info_fr",
  "personal_tip_en", "personal_tip_fr", "story_en", "story_fr", "vibe",
  "audience_tags", "occasion_tags", "dietary_tags", "offscript_pick_level",
  "offscript_priority", "offscript_reason_nl", "offscript_reason_fr", "offscript_reason_en",
  "authenticity", "food_orientation", "audience_orientation", "adventure_level", "price_level",
  "traveller_types", "child_friendly", "work_friendly", "best_timing", "opening_hours",
  "contact_person", "phone", "facebook_url", "instagram_url", "tiktok_url", "google_maps_url",
  "transport", "safety_notes", "image_1", "image_2", "image_3", "ai_confidence",
  "review_status", "reviewed_by", "review_notes"
] as const;

const nullableText = z.string().nullable();
const structuredNoteSchema = z.object({
  place_name: nullableText,
  entry_type: z.enum(["place", "story", "experience", "update", "unknown"]),
  country: nullableText, region: nullableText, neighbourhood: nullableText, area: nullableText,
  categories: z.array(z.string()), subcategories: z.array(z.string()),
  short_description_en: nullableText, short_description_fr: nullableText,
  practical_info_en: nullableText, practical_info_fr: nullableText,
  personal_tip_en: nullableText, personal_tip_fr: nullableText,
  story_en: nullableText, story_fr: nullableText, vibe: nullableText,
  audience_tags: z.array(z.string()), occasion_tags: z.array(z.string()), dietary_tags: z.array(z.string()),
  offscript_pick_level: z.number().int().min(0).max(3).nullable(),
  offscript_priority: z.number().int().min(0).max(100).nullable(),
  offscript_reason_nl: nullableText, offscript_reason_fr: nullableText, offscript_reason_en: nullableText,
  authenticity: z.number().int().min(0).max(4).nullable(),
  food_orientation: z.number().int().min(-2).max(2).nullable(),
  audience_orientation: z.number().int().min(-2).max(2).nullable(),
  adventure_level: z.number().int().min(0).max(3).nullable(),
  price_level: z.number().int().min(1).max(5).nullable(),
  traveller_types: z.array(z.string()), child_friendly: z.boolean().nullable(), work_friendly: z.boolean().nullable(),
  best_timing: z.array(z.string()), opening_hours: nullableText, contact_person: nullableText, phone: nullableText,
  facebook_url: nullableText, instagram_url: nullableText, tiktok_url: nullableText, google_maps_url: nullableText,
  transport: nullableText, safety_notes: nullableText,
  image_1: nullableText, image_2: nullableText, image_3: nullableText,
  confidence: z.number().min(0).max(1), review_notes: z.array(z.string())
});

type StructuredNote = z.infer<typeof structuredNoteSchema>;
type Cell = string | number | boolean;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
}
function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function range(sheet: string, cells: string): string { return `'${sheet.replaceAll("'", "''")}'!${cells}`; }
function findColumn(sourceHeaders: string[], aliases: string[]): number {
  return sourceHeaders.findIndex((header) => aliases.includes(normalize(header)));
}
function cell(value: unknown): Cell { return value === null || value === undefined ? "" : value as Cell; }
function list(value: string[]): string { return value.join(", "); }
function leadingInteger(value: unknown, min: number, max: number): number | null {
  const match = String(value ?? "").trim().match(/^(\d+)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function structuredRow(sourceId: string, timestamp: string, researcher: string, note: StructuredNote): Cell[] {
  const values: Record<(typeof headers)[number], Cell> = {
    source_note_id: sourceId, source_timestamp: timestamp, researcher,
    place_name: cell(note.place_name), entry_type: note.entry_type, country: cell(note.country), region: cell(note.region),
    neighbourhood: cell(note.neighbourhood), area: cell(note.area), categories: list(note.categories), subcategories: list(note.subcategories),
    short_description_en: cell(note.short_description_en), short_description_fr: cell(note.short_description_fr),
    practical_info_en: cell(note.practical_info_en), practical_info_fr: cell(note.practical_info_fr),
    personal_tip_en: cell(note.personal_tip_en), personal_tip_fr: cell(note.personal_tip_fr), story_en: cell(note.story_en), story_fr: cell(note.story_fr),
    vibe: cell(note.vibe), audience_tags: list(note.audience_tags), occasion_tags: list(note.occasion_tags), dietary_tags: list(note.dietary_tags),
    offscript_pick_level: cell(note.offscript_pick_level), offscript_priority: cell(note.offscript_priority),
    offscript_reason_nl: cell(note.offscript_reason_nl), offscript_reason_fr: cell(note.offscript_reason_fr), offscript_reason_en: cell(note.offscript_reason_en),
    authenticity: cell(note.authenticity), food_orientation: cell(note.food_orientation), audience_orientation: cell(note.audience_orientation),
    adventure_level: cell(note.adventure_level), price_level: cell(note.price_level), traveller_types: list(note.traveller_types),
    child_friendly: cell(note.child_friendly), work_friendly: cell(note.work_friendly), best_timing: list(note.best_timing), opening_hours: cell(note.opening_hours),
    contact_person: cell(note.contact_person), phone: cell(note.phone), facebook_url: cell(note.facebook_url), instagram_url: cell(note.instagram_url),
    tiktok_url: cell(note.tiktok_url), google_maps_url: cell(note.google_maps_url), transport: cell(note.transport), safety_notes: cell(note.safety_notes),
    image_1: cell(note.image_1), image_2: cell(note.image_2), image_3: cell(note.image_3), ai_confidence: note.confidence,
    review_status: "needs_review", reviewed_by: "", review_notes: note.review_notes.join(" | ")
  };
  return headers.map((header) => values[header]);
}

async function structureDraft(input: Record<string, unknown>): Promise<StructuredNote> {
  const response = await getOpenAIClient().responses.parse({
    model: openaiModel,
    instructions: `You are OFFSCRIPT's careful field-research editor. Convert one informal field note into structured data.
Rules:
- Never invent a fact. Use null or [] when the note does not support a field.
- Preserve names, phone numbers, URLs, opening hours and practical facts exactly.
- Produce concise editorial copy in both French and English only when the underlying fact is supported.
- Form selections supplied alongside the draft are human observations and take priority over inference.
- Normalize tags to lowercase snake_case English.
- categories and subcategories must describe the place, not incidental words.
- offscript_priority is null unless explicitly supplied; do not manufacture editorial priority.
- Add every uncertainty or missing safety-critical fact to review_notes.
- confidence measures extraction confidence, not place quality.`,
    input: JSON.stringify(input),
    text: { format: zodTextFormat(structuredNoteSchema, "structured_field_note") }
  });
  if (!response.output_parsed) throw new Error("OpenAI returned no structured field note.");
  return response.output_parsed;
}

async function main(): Promise<void> {
  required("OPENAI_API_KEY");
  const spreadsheetId = required("GOOGLE_FIELD_NOTES_SPREADSHEET_ID");
  const auth = new google.auth.JWT({
    email: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  const sheets = google.sheets({ version: "v4", auth });
  const fieldValues = (await sheets.spreadsheets.values.get({ spreadsheetId, range: range(FIELD_NOTES_SHEET, "A:Z") })).data.values ?? [];
  if (!fieldValues.length) throw new Error(`Sheet "${FIELD_NOTES_SHEET}" has no headers.`);
  const fieldHeaders = fieldValues[0].map(String);
  const normalizedHeaders = fieldHeaders.map(normalize);
  const timestampIndex = findColumn(fieldHeaders, ["timestamp", "horodateur"]);
  const draftIndex = findColumn(fieldHeaders, ["note de terrain", "draft"]);
  const researcherIndex = findColumn(fieldHeaders, ["nom de la personne qui fait la recherche", "researcher"]);
  const statusIndex = findColumn(fieldHeaders, ["status", "statut"]);
  if ([timestampIndex, draftIndex, statusIndex].some((index) => index < 0)) throw new Error("Field Notes must contain timestamp, Note de terrain, and status.");

  const existing = (await sheets.spreadsheets.values.get({ spreadsheetId, range: range(STRUCTURED_SHEET, "A:ZZ") })).data.values ?? [];
  const existingHeaders = (existing[0] ?? []).map(String);
  const existingSourceIndex = existingHeaders.map(normalize).indexOf("source_note_id");
  const existingIds = new Set(existing.slice(1).map((row) => String(row[existingSourceIndex] ?? "")).filter(Boolean));
  if (!dryRun) {
    await sheets.spreadsheets.values.update({ spreadsheetId, range: range(STRUCTURED_SHEET, `A1:BA1`), valueInputOption: "RAW", requestBody: { values: [[...headers]] } });
  }

  let processed = 0;
  for (const [offset, row] of fieldValues.slice(1).entries()) {
    const sheetRow = offset + 2;
    if (normalize(row[statusIndex]) !== "new") continue;
    const timestamp = String(row[timestampIndex] ?? "").trim();
    const draft = String(row[draftIndex] ?? "").trim();
    if (!timestamp || !draft) { console.warn(`Skipping Field Notes row ${sheetRow}: timestamp or draft missing.`); continue; }
    const sourceId = `field-note:${timestamp}`;
    if (existingIds.has(sourceId)) { console.warn(`Skipping Field Notes row ${sheetRow}: already structured.`); continue; }
    const source = Object.fromEntries(normalizedHeaders.map((header, index) => [header, row[index] ?? null]));
    const note = await structureDraft({ source_note_id: sourceId, timestamp, draft, form_observations: source });
    // Explicit human form selections always override AI inference.
    note.offscript_pick_level = leadingInteger(source["ton impression offscript"], 0, 3) ?? note.offscript_pick_level;
    note.authenticity = leadingInteger(source.authenticite, 0, 4) ?? note.authenticity;
    note.price_level = leadingInteger(source["niveau de prix"], 1, 5) ?? note.price_level;
    console.log(`${dryRun ? "Would process" : "Processing"} ${sourceId}: ${note.place_name ?? "unnamed note"} (${note.confidence})`);
    if (!dryRun) {
      await sheets.spreadsheets.values.append({ spreadsheetId, range: range(STRUCTURED_SHEET, "A:BA"), valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [structuredRow(sourceId, timestamp, String(row[researcherIndex] ?? ""), note)] } });
      await sheets.spreadsheets.values.update({ spreadsheetId, range: range(FIELD_NOTES_SHEET, `${String.fromCharCode(65 + statusIndex)}${sheetRow}`), valueInputOption: "RAW", requestBody: { values: [["ai_processed"]] } });
    }
    processed++;
  }
  console.log(`${dryRun ? "Dry run" : "Processing"} complete: ${processed} new field note(s).`);
}

main().catch((error) => { console.error("Field Notes processing failed", error); process.exitCode = 1; });
