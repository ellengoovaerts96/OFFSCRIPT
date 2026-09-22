import "dotenv/config";
import { google } from "googleapis";
import { zodTextFormat } from "openai/helpers/zod";
import pg, { type PoolClient } from "pg";
import { z } from "zod";
import { getOpenAIClient, openaiModel } from "../src/integrations/openai.js";
import { extractVibeTags } from "../src/logic/vibeTags.js";
import { PLACE_AMENITIES } from "../src/types/place.js";

const SHEET_NAME = "Structured Import";
const dryRun = process.argv.includes("--dry-run");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--dry-run");
const GOOGLE_REQUEST_TIMEOUT_MS = 20_000;
const DATABASE_CONNECTION_TIMEOUT_MS = 15_000;

type SheetRow = { sheetRow: number; values: Record<string, string> };
type ExistingPlace = { id: string; name: string; source_row_id: string | null; values: Record<string, unknown> };
type TranslationFields = {
  area_fr: string | null;
  short_description_fr: string | null;
  practical_info_fr: string | null;
  personal_tip_fr: string | null;
  story_fr: string | null;
  offscript_reason_fr: string | null;
};
type PlaceValues = {
  source_row_id: string; name: string; country: string; region: string; neighbourhood: string | null;
  area: string | null; area_en: string | null; area_fr: string | null; categories: string[]; subcategories: string[];
  short_description: string; short_description_en: string; short_description_fr: string | null;
  practical_info: string | null; practical_info_en: string | null; practical_info_fr: string | null;
  personal_tip: string | null; personal_tip_en: string | null; personal_tip_fr: string | null;
  story_en: string | null; story_fr: string | null; vibe: string | null; vibe_tags: string[];
  audience_tags: string[]; occasion_tags: string[]; offscript_pick_level: number; offscript_priority: number;
  offscript_reason_en: string | null; offscript_reason_fr: string | null; authenticity: number | null;
  food_orientation: number | null; audience_orientation: number | null; adventure_level: number | null;
  price_level: number | null; traveller_types: string[]; child_friendly: boolean; work_friendly: boolean | null;
  amenities: string[]; dietary_tags: string[]; best_timing: string[]; opening_hours: string | null; facebook_url: string | null;
  instagram_url: string | null; tiktok_url: string | null; google_maps_url: string; transport: string | null;
  transport_notes: string | null; safety_notes: string | null; reservation_contact_name: string | null;
  reservation_phone: string | null; source: string; verified_by: string | null; last_verified_at: string | null;
  editorial_review_status: "approved"; editorial_verified_by: string | null; editorial_review_notes: string | null;
};
type SyncPlan = {
  row: SheetRow; values: PlaceValues; existing?: ExistingPlace; changedFields: string[];
  imageUrls: string[]; imageAdditions: string[];
};

const translationSchema = z.object({
  translations: z.array(z.object({
    sheetRow: z.number().int(),
    area_fr: z.string().nullable(),
    short_description_fr: z.string().nullable(),
    practical_info_fr: z.string().nullable(),
    personal_tip_fr: z.string().nullable(),
    story_fr: z.string().nullable(),
    offscript_reason_fr: z.string().nullable()
  }))
});

const syncedColumns = [
  "source_row_id", "name", "country", "region", "neighbourhood", "area", "area_en", "area_fr",
  "categories", "subcategories", "short_description", "short_description_en", "short_description_fr",
  "practical_info", "practical_info_en", "practical_info_fr", "personal_tip", "personal_tip_en",
  "personal_tip_fr", "story_en", "story_fr", "vibe", "vibe_tags", "audience_tags", "occasion_tags",
  "offscript_pick_level", "offscript_priority", "offscript_reason_en", "offscript_reason_fr", "authenticity",
  "food_orientation", "audience_orientation", "adventure_level", "price_level", "traveller_types",
  "child_friendly", "work_friendly", "amenities", "dietary_tags", "best_timing", "opening_hours", "facebook_url",
  "instagram_url", "tiktok_url", "google_maps_url", "transport", "transport_notes", "safety_notes",
  "reservation_contact_name", "reservation_phone", "source", "verified_by", "last_verified_at",
  "editorial_review_status", "editorial_verified_by", "editorial_review_notes"
] as const satisfies readonly (keyof PlaceValues)[];

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
}
function text(value: unknown): string | null { const normalized = String(value ?? "").trim(); return normalized || null; }
function normalize(value: unknown): string { return String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function normalizeName(value: string): string { return normalize(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function list(value: unknown): string[] { return [...new Set(String(value ?? "").split(",").map((item) => item.trim().toLowerCase().replace(/\s+/g, "_")).filter(Boolean))]; }
function tags(value: unknown): string[] {
  return [...new Set(String(value ?? "").split(",").map((item) => item.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")).filter(Boolean))];
}
function imageUrls(row: SheetRow): string[] {
  const candidates = [row.values.image_1, row.values.image_2, row.values.image_3]
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => value.trim()).filter(Boolean);
  for (const url of candidates) {
    try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); }
    catch { throw new Error(`Sheet row ${row.sheetRow} has an invalid image URL: ${JSON.stringify(url)}.`); }
  }
  return [...new Set(candidates)];
}
function integer(value: unknown, min: number, max: number, field: string): number | null {
  const raw = normalize(value);
  if (!raw || ["unknown", "inconnu", "non evalue", "not assessed", "n/a"].includes(raw)) return null;
  const match = raw.match(/^(-?\d+)(?:\s|—|–|-|$)/);
  if (!match) throw new Error(`${field} must start with an integer from ${min} to ${max}, or be unknown (received ${JSON.stringify(text(value))}).`);
  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${field} must be an integer from ${min} to ${max} (received ${JSON.stringify(text(value))}).`);
  return parsed;
}
function bool(value: unknown, field: string): boolean | null {
  const normalized = normalize(value);
  if (!normalized || ["unknown", "not assessed", "n/a"].includes(normalized)) return null;
  if (["true", "yes", "ja", "oui", "1"].includes(normalized)) return true;
  if (["false", "no", "nee", "non", "0"].includes(normalized)) return false;
  throw new Error(`${field} must be TRUE, FALSE, or blank.`);
}
function sourceId(value: string): string { return value.startsWith("field-note:") ? value : `field-note:${value}`; }
function date(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  if (!local) return null;
  const first = Number(local[1]); const second = Number(local[2]);
  if (first <= 12 && second <= 12) return null;
  const month = first > 12 ? second : first; const day = first > 12 ? first : second;
  return `${local[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function audienceTags(value: unknown): string[] {
  const aliases: Record<string, string> = {
    local: "residents", locals: "residents", resident: "residents", residents: "residents",
    african_expat: "expats", african_expats: "expats", international_expat: "expats",
    international_expats: "expats", expat: "expats", expats: "expats"
  };
  return [...new Set(list(value).map((item) => aliases[item] ?? item))];
}
function amenities(value: unknown): string[] {
  const allowed = new Set<string>(PLACE_AMENITIES);
  const supplied = list(value);
  const invalid = supplied.filter((item) => !allowed.has(item));
  if (invalid.length) console.warn(`Ignoring unsupported Structured Import amenities: ${invalid.join(", ")}.`);
  return supplied.filter((item) => allowed.has(item));
}
function comparable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(String));
  if (value === null || value === undefined) return "null";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}
function changedFields(existing: ExistingPlace | undefined, values: PlaceValues): string[] {
  if (!existing) return [...syncedColumns];
  return syncedColumns.filter((column) => comparable(existing.values[column]) !== comparable(values[column]));
}
function needsTranslation(existing: ExistingPlace | undefined, englishColumn: keyof PlaceValues, frenchColumn: keyof PlaceValues, english: string | null): boolean {
  if (!english) return false;
  return !existing || text(existing.values[englishColumn]) !== english || !text(existing.values[frenchColumn]);
}

function baseValues(row: SheetRow, existing?: ExistingPlace): PlaceValues {
  const visibleHeaderAliases: Record<string, string> = {
    offscript_pick_level: "tuuti_pick_level",
    offscript_priority: "tuuti_priority",
    offscript_reason_en: "tuuti_reason_en"
  };
  const value = (header: string): string => row.values[visibleHeaderAliases[header] ?? header] ?? row.values[header] ?? "";
  const name = text(value("place_name"));
  const region = text(value("region"));
  const description = text(value("short_description_en"));
  const maps = text(value("google_maps_url"));
  if (!name || !region || !description || !maps) {
    throw new Error(`Sheet row ${row.sheetRow} needs place_name, region, short_description_en, and google_maps_url.`);
  }
  const childFriendly = bool(value("child_friendly"), "child_friendly");
  const workFriendly = bool(value("work_friendly"), "work_friendly");
  const area = text(value("area"));
  const practical = text(value("practical_info_en"));
  const tip = text(value("personal_tip_en"));
  const story = text(value("story_en"));
  const reason = text(value("offscript_reason_en"));
  const transport = text(value("transport")) ?? text(value("transport_notes"));
  const verifier = text(value("reviewed_by")) ?? text(value("researcher"));
  return {
    source_row_id: sourceId(value("source_note_id")), name, country: text(value("country")) ?? "Senegal", region,
    neighbourhood: text(value("neighbourhood")), area, area_en: area, area_fr: text(existing?.values.area_fr),
    categories: list(value("categories")), subcategories: list(value("subcategories")),
    short_description: description, short_description_en: description, short_description_fr: text(existing?.values.short_description_fr),
    practical_info: practical, practical_info_en: practical, practical_info_fr: text(existing?.values.practical_info_fr),
    personal_tip: tip, personal_tip_en: tip, personal_tip_fr: text(existing?.values.personal_tip_fr),
    story_en: story, story_fr: text(existing?.values.story_fr), vibe: text(value("vibe")), vibe_tags: extractVibeTags(value("vibe")),
    audience_tags: audienceTags(value("audience_tags")), occasion_tags: list(value("occasion_tags")),
    offscript_pick_level: integer(value("offscript_pick_level"), 0, 3, "offscript_pick_level") ?? 0,
    offscript_priority: integer(value("offscript_priority"), 0, 100, "offscript_priority") ?? 0,
    offscript_reason_en: reason, offscript_reason_fr: text(existing?.values.offscript_reason_fr),
    authenticity: integer(value("authenticity"), 0, 4, "authenticity"),
    food_orientation: integer(value("food_orientation"), -2, 2, "food_orientation"),
    audience_orientation: integer(value("audience_orientation"), -2, 2, "audience_orientation"),
    adventure_level: integer(value("adventure_level"), 0, 3, "adventure_level"),
    price_level: integer(value("price_level"), 1, 5, "price_level"), traveller_types: list(value("traveller_types")),
    child_friendly: childFriendly ?? false, work_friendly: workFriendly, amenities: amenities(value("amenities")),
    dietary_tags: tags(value("dietary_tags")),
    best_timing: list(value("best_timing")), opening_hours: text(value("opening_hours")),
    facebook_url: text(value("facebook_url")), instagram_url: text(value("instagram_url")), tiktok_url: text(value("tiktok_url")),
    google_maps_url: maps, transport, transport_notes: transport, safety_notes: text(value("safety_notes")),
    reservation_contact_name: text(value("contact_person")), reservation_phone: text(value("phone")),
    source: `field_notes_structured_import:${sourceId(value("source_note_id"))}`, verified_by: verifier,
    last_verified_at: date(value("visit_date")), editorial_review_status: "approved", editorial_verified_by: verifier,
    editorial_review_notes: text(value("review_notes"))
  };
}

async function translations(plans: SyncPlan[]): Promise<Map<number, TranslationFields>> {
  const requests = plans.flatMap((plan) => {
    const v = plan.values; const existing = plan.existing;
    const requested = {
      sheetRow: plan.row.sheetRow,
      area_en: needsTranslation(existing, "area_en", "area_fr", v.area_en) ? v.area_en : null,
      short_description_en: needsTranslation(existing, "short_description_en", "short_description_fr", v.short_description_en) ? v.short_description_en : null,
      practical_info_en: needsTranslation(existing, "practical_info_en", "practical_info_fr", v.practical_info_en) ? v.practical_info_en : null,
      personal_tip_en: needsTranslation(existing, "personal_tip_en", "personal_tip_fr", v.personal_tip_en) ? v.personal_tip_en : null,
      story_en: needsTranslation(existing, "story_en", "story_fr", v.story_en) ? v.story_en : null,
      offscript_reason_en: needsTranslation(existing, "offscript_reason_en", "offscript_reason_fr", v.offscript_reason_en) ? v.offscript_reason_en : null
    };
    return Object.values(requested).some((item, index) => index > 0 && item) ? [requested] : [];
  });
  if (!requests.length) return new Map();
  required("OPENAI_API_KEY");
  const output = new Map<number, TranslationFields>();
  const openai = getOpenAIClient({ timeoutMs: 120_000, maxRetries: 2 });
  for (let offset = 0; offset < requests.length; offset += 4) {
    const batch = requests.slice(offset, offset + 4);
    const response = await openai.responses.parse({
      model: openaiModel,
      instructions: `Translate the supplied English TUUTI place content faithfully into natural French.
- Preserve every fact, URL, proper name, emoji and list/bullet format.
- Keep null source fields null.
- Do not add claims or improve the content.
- Return exactly one result for every sheetRow.`,
      input: JSON.stringify(batch),
      text: { format: zodTextFormat(translationSchema, "structured_import_translations") }
    });
    const translated = response.output_parsed?.translations;
    if (!translated || translated.length !== batch.length) throw new Error(`OpenAI returned ${translated?.length ?? 0} translations for ${batch.length} rows.`);
    for (const item of translated) output.set(item.sheetRow, item);
  }
  return output;
}

async function syncSubcategories(client: PoolClient, placeId: string, names: string[]): Promise<void> {
  await client.query(`DELETE FROM public.place_subcategories WHERE place_id=$1 AND NOT (name=ANY($2::text[]))`, [placeId, names]);
  for (const [displayOrder, name] of names.entries()) {
    await client.query(`INSERT INTO public.place_subcategories (place_id,name,display_order) VALUES ($1,$2,$3)
      ON CONFLICT (place_id,name) DO UPDATE SET display_order=EXCLUDED.display_order`, [placeId, name, displayOrder]);
  }
}
async function syncContact(client: PoolClient, placeId: string, values: PlaceValues): Promise<void> {
  const phone = values.reservation_phone;
  if (!phone) return;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return;
  const matches = await client.query<{ id: string }>(`SELECT id FROM public.contacts WHERE regexp_replace(COALESCE(phone,''),'\\D','','g')=$1`, [digits]);
  if (matches.rowCount && matches.rowCount > 1) throw new Error(`Phone ending in ${digits.slice(-4)} matches multiple contacts.`);
  let contactId = matches.rows[0]?.id;
  if (contactId) {
    await client.query(`UPDATE public.contacts SET name=COALESCE(name,$1), whatsapp=COALESCE(whatsapp,$2), region=COALESCE(region,$3) WHERE id=$4`,
      [values.reservation_contact_name, phone, values.region, contactId]);
  } else {
    const inserted = await client.query<{ id: string }>(`INSERT INTO public.contacts (name,phone,whatsapp,region,trusted) VALUES ($1,$2,$2,$3,false) RETURNING id`,
      [values.reservation_contact_name ?? values.name, phone, values.region]);
    contactId = inserted.rows[0]!.id;
  }
  await client.query(`INSERT INTO public.place_contacts (place_id,contact_id) VALUES ($1,$2) ON CONFLICT (place_id,contact_id) DO NOTHING`, [placeId, contactId]);
}
async function syncImages(client: PoolClient, placeId: string, urls: string[]): Promise<void> {
  if (!urls.length) return;
  await client.query(`SELECT id FROM public.places WHERE id=$1 FOR UPDATE`, [placeId]);
  for (const url of urls) {
    const next = await client.query<{ sort_order: number }>(
      `SELECT COALESCE(MAX(sort_order),-1)::int+1 AS sort_order FROM public.place_images WHERE place_id=$1`, [placeId]
    );
    await client.query(`INSERT INTO public.place_images (place_id,url,sort_order,is_hero_image,source)
      VALUES ($1,$2,$3,false,'field_research') ON CONFLICT (place_id,url) DO NOTHING`,
      [placeId, url, next.rows[0]?.sort_order ?? 0]);
  }
  const hero = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM public.place_images WHERE place_id=$1 AND is_hero_image) AS exists`, [placeId]
  );
  if (!hero.rows[0]?.exists) {
    await client.query(`UPDATE public.place_images SET is_hero_image=true WHERE id=(
      SELECT id FROM public.place_images WHERE place_id=$1 ORDER BY sort_order,created_at,id LIMIT 1
    )`, [placeId]);
  }
}
async function writePlan(client: PoolClient, plan: SyncPlan): Promise<void> {
  const values = syncedColumns.map((column) => plan.values[column]);
  let placeId = plan.existing?.id;
  if (placeId) {
    if (plan.changedFields.length) {
      const assignments = syncedColumns.map((column, index) => `${column}=$${index + 1}`).join(",");
      await client.query(`UPDATE public.places SET ${assignments},updated_at=NOW() WHERE id=$${values.length + 1}`, [...values, placeId]);
    }
  } else {
    const inserted = await client.query<{ id: string }>(`INSERT INTO public.places (${syncedColumns.join(",")},status)
      VALUES (${syncedColumns.map((_, index) => `$${index + 1}`).join(",")},'draft') RETURNING id`, values);
    placeId = inserted.rows[0]!.id;
  }
  await syncSubcategories(client, placeId, plan.values.subcategories);
  await syncContact(client, placeId, plan.values);
  await syncImages(client, placeId, plan.imageUrls);
}

async function main(): Promise<void> {
  if (unknownArguments.length) throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}. Supported: --dry-run`);
  console.log(`Structured Import sync starting in ${dryRun ? "read-only dry-run" : "write"} mode.`);
  const auth = new google.auth.JWT({
    email: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"), key: required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: required("GOOGLE_FIELD_NOTES_SPREADSHEET_ID"), range: `'${SHEET_NAME}'!A:ZZ`
  }, { timeout: GOOGLE_REQUEST_TIMEOUT_MS });
  const rows = response.data.values ?? [];
  const headers = (rows[0] ?? []).map((header) => normalize(header).replace(/\s+/g, "_"));
  const requiredHeaders = ["source_note_id", "place_name", "entry_type", "region", "short_description_en", "google_maps_url", "review_status"];
  for (const header of requiredHeaders) if (!headers.includes(header)) throw new Error(`Missing Sheet column: ${header}.`);
  const sheetRows: SheetRow[] = rows.slice(1).map((row, offset) => ({
    sheetRow: offset + 2,
    values: Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "").trim()]))
  })).filter((row) => normalize(row.values.review_status) === "approved" && normalize(row.values.entry_type) === "place");

  const pool = new pg.Pool({ connectionString: required("DATABASE_URL"), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS });
  const client = await pool.connect();
  try {
    const existingResult = await client.query<Record<string, unknown>>(`SELECT * FROM public.places ORDER BY name`);
    const existingImagesResult = await client.query<{ place_id: string; url: string }>(`SELECT place_id,url FROM public.place_images`);
    const existingImageUrls = new Map<string, Set<string>>();
    for (const image of existingImagesResult.rows) {
      const urls = existingImageUrls.get(image.place_id) ?? new Set<string>();
      urls.add(image.url); existingImageUrls.set(image.place_id, urls);
    }
    const existing = existingResult.rows.map((row) => ({ id: String(row.id), name: String(row.name), source_row_id: text(row.source_row_id), values: row }));
    const bySource = new Map(existing.filter((place) => place.source_row_id).map((place) => [place.source_row_id!, place]));
    const byName = new Map<string, ExistingPlace[]>();
    for (const place of existing) byName.set(normalizeName(place.name), [...(byName.get(normalizeName(place.name)) ?? []), place]);

    const plans: SyncPlan[] = [];
    const validationErrors: string[] = [];
    for (const row of sheetRows) {
      const id = sourceId(row.values.source_note_id ?? "");
      if (!text(row.values.source_note_id)) throw new Error(`Sheet row ${row.sheetRow} has no source_note_id.`);
      const sourceMatch = bySource.get(id);
      const nameMatches = byName.get(normalizeName(row.values.place_name ?? "")) ?? [];
      if (!sourceMatch && nameMatches.length > 1) throw new Error(`Sheet row ${row.sheetRow} (${row.values.place_name}) has an ambiguous place-name match.`);
      if (sourceMatch && nameMatches.length === 1 && sourceMatch.id !== nameMatches[0]!.id) throw new Error(`Sheet row ${row.sheetRow} source ID and name match different places.`);
      const matched = sourceMatch ?? nameMatches[0];
      let values: PlaceValues;
      try { values = baseValues(row, matched); }
      catch (error) {
        validationErrors.push(`Sheet row ${row.sheetRow} (${row.values.place_name || "unnamed"}): ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      let images: string[];
      try { images = imageUrls(row); }
      catch (error) {
        validationErrors.push(error instanceof Error ? error.message : String(error));
        continue;
      }
      const currentUrls = matched ? existingImageUrls.get(matched.id) ?? new Set<string>() : new Set<string>();
      plans.push({ row, values, existing: matched, changedFields: [], imageUrls: images, imageAdditions: images.filter((url) => !currentUrls.has(url)) });
    }
    if (validationErrors.length) throw new Error(`Validation failed:\n- ${validationErrors.join("\n- ")}`);

    const pendingTranslationRows = plans.filter((plan) => {
      const v = plan.values; const e = plan.existing;
      return needsTranslation(e, "area_en", "area_fr", v.area_en)
        || needsTranslation(e, "short_description_en", "short_description_fr", v.short_description_en)
        || needsTranslation(e, "practical_info_en", "practical_info_fr", v.practical_info_en)
        || needsTranslation(e, "personal_tip_en", "personal_tip_fr", v.personal_tip_en)
        || needsTranslation(e, "story_en", "story_fr", v.story_en)
        || needsTranslation(e, "offscript_reason_en", "offscript_reason_fr", v.offscript_reason_en);
    });

    if (!dryRun) {
      const translated = await translations(plans);
      for (const plan of plans) {
        const item = translated.get(plan.row.sheetRow);
        if (!item) continue;
        Object.assign(plan.values, item);
      }
    }
    for (const plan of plans) {
      plan.changedFields = changedFields(plan.existing, plan.values);
      console.log(JSON.stringify({ action: plan.changedFields.length ? (plan.existing ? "update" : "insert") : (plan.imageAdditions.length ? "add_images" : "unchanged"), place: plan.values.name, changedFields: plan.changedFields, imagesToAdd: plan.imageAdditions.length }));
    }
    const changed = plans.filter((plan) => plan.changedFields.length || plan.imageAdditions.length);
    if (!dryRun && changed.length) {
      await client.query("BEGIN");
      try { for (const plan of changed) await writePlan(client, plan); await client.query("COMMIT"); }
      catch (error) { await client.query("ROLLBACK"); throw error; }
    }
    const inserts = changed.filter((plan) => !plan.existing).length;
    const updates = changed.filter((plan) => plan.existing && plan.changedFields.length).length;
    const addedImages = changed.reduce((count, plan) => count + plan.imageAdditions.length, 0);
    console.log(`${dryRun ? "Read-only dry run" : "Sync"} complete: ${sheetRows.length} approved place rows validated; ${inserts} inserts; ${updates} updates; ${addedImages} images added; ${pendingTranslationRows.length} rows require French translation.`);
  } finally { client.release(); await pool.end(); }
}

main().catch((error: unknown) => {
  console.error(`Structured Import sync failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
