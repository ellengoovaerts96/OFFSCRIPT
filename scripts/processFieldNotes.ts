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
  country: nullableText.describe("Country, for example Senegal"),
  region: nullableText.describe("Large administrative region or city-region, for example Dakar"),
  neighbourhood: nullableText.describe("OFFSCRIPT database field for the broader district or commune, for example Ngor, Yoff or Ouakam"),
  area: nullableText.describe("OFFSCRIPT database field for the precise neighbourhood or micro-location, for example Almadies plage"),
  categories: z.array(z.string()), subcategories: z.array(z.string()),
  short_description_en: nullableText.describe("Concise, warm English recommendation written like a trusted local friend suggesting the place"),
  short_description_fr: nullableText.describe("Concise, warm French recommendation written like a trusted local friend suggesting the place"),
  practical_info_en: nullableText.describe("Scannable English bullet list; one supported practical fact per line, formatted as '- emoji Fact'"),
  practical_info_fr: nullableText.describe("Scannable French bullet list; one supported practical fact per line, formatted as '- emoji Fait'"),
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
function normalizeAudienceTags(values: string[]): string[] {
  const aliases: Record<string, string> = {
    local: "residents", locals: "residents", resident: "residents", residents: "residents", habitants_locaux: "residents",
    african_expat: "expats", african_expats: "expats",
    international_expat: "expats", international_expats: "expats", expat: "expats", expats: "expats",
    expatrie: "expats", expatries: "expats", expatries_africains: "expats", expatries_internationaux: "expats"
  };
  return [...new Set(values.map((value) => aliases[normalize(value).replace(/\s+/g, "_")] ?? normalize(value).replace(/\s+/g, "_")).filter(Boolean))];
}
function normalizeFoodTaxonomy(note: StructuredNote): void {
  const categoryAliases = new Set(["restaurant", "restaurants", "cafe", "cafes", "food_and_drink"]);
  const normalizedCategories = note.categories.map((value) => normalize(value).replace(/\s+/g, "_"));
  const normalizedSubcategories = note.subcategories.map((value) => normalize(value).replace(/\s+/g, "_"));
  const isFoodAndDrink = [...normalizedCategories, ...normalizedSubcategories].some((value) => categoryAliases.has(value));

  note.categories = [...new Set([
    ...normalizedCategories.filter((value) => !categoryAliases.has(value)),
    ...(isFoodAndDrink ? ["food_and_drink"] : [])
  ].filter(Boolean))];
  note.subcategories = [...new Set(normalizedSubcategories
    .filter((value) => !categoryAliases.has(value))
    .map((value) => value === "diner" ? "dinner" : value)
    .filter(Boolean))];
}
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
- Write short_description_en and short_description_fr in OFFSCRIPT's local-friend voice, not as a travel guide or database summary.
- Pick one or two memorable, concrete reasons to recommend the place instead of compressing every category, audience and facility into the description.
- Address the reader directly. Use short, conversational sentences, natural contractions and specific advice such as what to order, who makes the place welcoming, or when it is worth staying longer.
- Good tone: "Don’t skip breakfast here. The Mexican chef knows exactly what he’s doing. You can even order ahead, so your food is ready when you arrive."
- Good tone: "If there’s live music that night, order another drink and stay a while."
- Avoid phrases such as "offering a varied menu", "serves residents and expats", "perfect for", "sport fans and remote workers alike", "considered among the best", and other brochure-style claims.
- Do not mention audience tags merely to summarize database fields. Use them only when they create genuinely useful advice.
- The OFFSCRIPT editorial voice may say "we’d send you here" or "one reason we like this place" when the source supports a clear recommendation. Never invent a visit, person, chef, event or personal experience.
- Format practical_info_en and practical_info_fr as compact multiline bullet lists, never as prose paragraphs.
- Every practical-info line must use the exact pattern "- emoji Fact", with one relevant emoji and one fact per line.
- Practical info may cover food, facilities, setting, suitability, recurring events and verified opening hours.
- Keep related opening hours on one bullet. Do not add bullets for facts that are not present in the source note.
- Example English formatting: "- 🍺 Pub & restaurant\n- 🌊 Oceanfront terrace\n- 🎤 Karaoke every Thursday evening".
- Form selections supplied alongside the draft are human observations and take priority over inference.
- Map geography to the existing OFFSCRIPT database convention, even though everyday geographic terminology may differ.
- region is the large administrative or city-region level (for example Dakar).
- neighbourhood is the broader district or commune in the OFFSCRIPT database (for example Ngor, Yoff or Ouakam).
- area is the most precise named neighbourhood or micro-location in the OFFSCRIPT database (for example Almadies plage).
- Example: Dakar must be region, Ngor must be neighbourhood and Almadies plage must be area.
- Normalize tags to lowercase snake_case English.
- For audience_tags, always use "residents" instead of "locals" and use "expats" for all expats; never distinguish African from international expats.
- categories and subcategories must describe the place, not incidental words.
- Every restaurant, cafe, or restaurant-cafe uses the single category "food_and_drink". Never use "restaurant" or "cafe" as a category or subcategory.
- Within food_and_drink, use "bar" when the source supports drinks, bar or cafe service, and use "lunch" and/or "dinner" when the source note or verified opening hours support those meal periods.
- Opening from around midday through late evening supports both "lunch" and "dinner".
- Daytime-only service supports "lunch"; evening-only service supports "dinner". Do not infer a meal when hours are absent or ambiguous.
- Meal availability belongs in subcategories. A particularly recommended moment belongs in best_timing, for example "lunch" when the place is notably better by day.
- offscript_priority is null unless explicitly supplied; do not manufacture editorial priority.
- Add every uncertainty or missing safety-critical fact to review_notes.
- confidence measures extraction confidence, not place quality.`,
    input: JSON.stringify(input),
    text: { format: zodTextFormat(structuredNoteSchema, "structured_field_note") }
  });
  if (!response.output_parsed) throw new Error("OpenAI returned no structured field note.");
  const note = response.output_parsed;
  normalizeFoodTaxonomy(note);
  note.audience_tags = normalizeAudienceTags(note.audience_tags);
  return note;
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
    const headerChanged = headers.some((header, index) => normalize(existingHeaders[index]) !== normalize(header));
    if (headerChanged) {
      const oldIndexes = new Map(existingHeaders.map((header, index) => [normalize(header), index]));
      const reorderedRows = existing.slice(1).map((row) =>
        headers.map((header) => {
          const oldIndex = oldIndexes.get(normalize(header));
          return oldIndex === undefined ? "" : row[oldIndex] ?? "";
        })
      );
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: range(STRUCTURED_SHEET, "A:ZZ") });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: range(STRUCTURED_SHEET, `A1:BA${reorderedRows.length + 1}`),
        valueInputOption: "RAW",
        requestBody: { values: [[...headers], ...reorderedRows] }
      });
    }
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
