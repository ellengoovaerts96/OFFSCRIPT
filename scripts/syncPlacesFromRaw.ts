import "dotenv/config";
import pg, { type PoolClient } from "pg";
import { extractVibeTags } from "../src/logic/vibeTags.js";

type RawPlace = Record<string, unknown> & {
  id: number;
  source_row_id: string;
  place: string;
  entry_type: string | null;
};

type ExistingPlace = {
  id: string;
  source_row_id: string | null;
  name: string;
  status: string | null;
  values: Record<string, unknown>;
};

type PlaceValues = {
  source_row_id: string;
  name: string;
  country: string;
  region: string;
  neighbourhood: string | null;
  area: string | null;
  area_en: string | null;
  area_fr: string | null;
  categories: string[];
  subcategories: string[];
  short_description: string;
  short_description_en: string | null;
  short_description_fr: string | null;
  practical_info: string | null;
  practical_info_en: string | null;
  practical_info_fr: string | null;
  personal_tip: string | null;
  personal_tip_en: string | null;
  personal_tip_fr: string | null;
  story_en: string | null;
  story_fr: string | null;
  traveller_types: string[];
  child_friendly: boolean;
  best_timing: string[];
  price_level: string | null;
  google_maps_url: string;
  safety_notes: string | null;
  vibe: string | null;
  vibe_tags: string[];
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  transport: string | null;
  source: string;
};

type SyncPlan = {
  raw: RawPlace;
  values: PlaceValues;
  existing?: ExistingPlace;
  changedFields: string[];
};

const syncedColumns = [
  "source_row_id", "name", "country", "region", "neighbourhood", "area", "area_en", "area_fr",
  "categories", "subcategories", "short_description", "short_description_en", "short_description_fr",
  "practical_info", "practical_info_en", "practical_info_fr", "personal_tip", "personal_tip_en",
  "personal_tip_fr", "story_en", "story_fr", "traveller_types", "child_friendly", "best_timing",
  "price_level", "google_maps_url", "safety_notes", "vibe", "facebook_url", "instagram_url",
  "vibe_tags", "tiktok_url", "transport", "source"
] as const satisfies readonly (keyof PlaceValues)[];

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function list(value: unknown): string[] {
  const normalized = text(value);
  return normalized ? normalized.split(",").map((part) => part.trim()).filter(Boolean) : [];
}

function bool(value: unknown): boolean {
  return /^(yes|true|ja|oui|1)$/i.test(text(value) ?? "");
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function mapRaw(row: RawPlace): PlaceValues {
  const name = text(row.place);
  const region = text(row.region);
  const maps = text(row.google_maps_url);
  const shortEn = text(row.short_description_en) ?? text(row.short_description);
  if (!name || !region || !maps || !shortEn) {
    throw new Error(`Raw row ${row.id} cannot become a Place: name, region, Maps URL, or description is missing.`);
  }

  return {
    source_row_id: row.source_row_id,
    name,
    country: text(row.country) ?? "Senegal",
    region,
    neighbourhood: text(row.neighbourhood),
    area: text(row.area),
    area_en: text(row.area_en) ?? text(row.area),
    area_fr: text(row.area_fr),
    categories: list(row.categories),
    subcategories: list(row.subcategories),
    short_description: shortEn,
    short_description_en: shortEn,
    short_description_fr: text(row.short_description_fr),
    practical_info: text(row.practical_info_en) ?? text(row.practical_info),
    practical_info_en: text(row.practical_info_en) ?? text(row.practical_info),
    practical_info_fr: text(row.practical_info_fr),
    personal_tip: text(row.personal_tip_en) ?? text(row.personal_tip),
    personal_tip_en: text(row.personal_tip_en) ?? text(row.personal_tip),
    personal_tip_fr: text(row.personal_tip_fr),
    story_en: text(row.story_en) ?? text(row.story),
    story_fr: text(row.story_fr),
    traveller_types: list(row.traveller_types),
    child_friendly: bool(row.child_friendly),
    best_timing: list(row.best_timing),
    price_level: text(row.price_level),
    google_maps_url: maps,
    safety_notes: text(row.safety_notes),
    vibe: text(row.vibe),
    vibe_tags: extractVibeTags(row.vibe),
    facebook_url: text(row.facebook_url),
    instagram_url: text(row.instagram_url),
    tiktok_url: text(row.tiktok_url),
    transport: text(row.transport),
    source: `field_research_raw:${row.source_row_id}`
  };
}

function comparable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(String));
  if (value === null || value === undefined) return "null";
  return String(value);
}

function changedFields(existing: ExistingPlace | undefined, values: PlaceValues): string[] {
  if (!existing) return [...syncedColumns];
  return syncedColumns.filter((column) => comparable(existing.values[column]) !== comparable(values[column]));
}

async function syncSubcategories(client: PoolClient, placeId: string, names: string[]): Promise<void> {
  await client.query(
    `DELETE FROM public.place_subcategories WHERE place_id = $1 AND NOT (name = ANY($2::text[]))`,
    [placeId, names]
  );
  for (const [displayOrder, name] of names.entries()) {
    await client.query(
      `INSERT INTO public.place_subcategories (place_id, name, display_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (place_id, name) DO UPDATE SET display_order = EXCLUDED.display_order`,
      [placeId, name, displayOrder]
    );
  }
}

async function writePlan(client: PoolClient, plan: SyncPlan): Promise<void> {
  const values = syncedColumns.map((column) => plan.values[column]);
  let placeId = plan.existing?.id;

  if (placeId) {
    const assignments = syncedColumns.map((column, index) => `${column} = $${index + 1}`).join(", ");
    await client.query(
      `UPDATE public.places SET ${assignments}, updated_at = NOW() WHERE id = $${values.length + 1}`,
      [...values, placeId]
    );
  } else {
    const placeholders = syncedColumns.map((_, index) => `$${index + 1}`).join(", ");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO public.places (${syncedColumns.join(", ")}, status)
       VALUES (${placeholders}, 'draft') RETURNING id`,
      values
    );
    placeId = inserted.rows[0]!.id;
  }

  await syncSubcategories(client, placeId, plan.values.subcategories);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is missing.");
  const dryRun = process.argv.includes("--dry-run");
  const { Pool } = pg;
  const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined });
  const client = await pool.connect();

  try {
    const raw = await client.query<RawPlace>(`
      SELECT * FROM public.field_research_raw
      WHERE source_row_id IS NOT NULL
        AND lower(COALESCE(entry_type, 'place')) LIKE '%place%'
        AND NULLIF(btrim(place), '') IS NOT NULL
      ORDER BY place
    `);
    const existingResult = await client.query<Record<string, unknown>>(`SELECT * FROM public.places ORDER BY name`);
    const existing = existingResult.rows.map((row) => ({
      id: String(row.id), source_row_id: text(row.source_row_id), name: String(row.name),
      status: text(row.status), values: row
    } satisfies ExistingPlace));
    const bySource = new Map(existing.filter((row) => row.source_row_id).map((row) => [row.source_row_id!, row]));
    const byName = new Map<string, ExistingPlace[]>();
    for (const row of existing) {
      const key = normalizeName(row.name);
      byName.set(key, [...(byName.get(key) ?? []), row]);
    }

    const plans: SyncPlan[] = [];
    let skipped = 0;
    for (const row of raw.rows) {
      let values: PlaceValues;
      try { values = mapRaw(row); } catch (error) {
        skipped += 1;
        console.warn(error instanceof Error ? error.message : String(error));
        continue;
      }
      const sourceMatch = bySource.get(row.source_row_id);
      const nameMatches = byName.get(normalizeName(values.name)) ?? [];
      if (!sourceMatch && nameMatches.length > 1) {
        skipped += 1;
        console.warn(`Skipping Raw row ${row.id} (${values.name}): ambiguous Places name match.`);
        continue;
      }
      const match = sourceMatch ?? nameMatches[0];
      const changes = changedFields(match, values);
      if (changes.length) plans.push({ raw: row, values, existing: match, changedFields: changes });
    }

    for (const plan of plans) {
      console.log(JSON.stringify({ action: plan.existing ? "update" : "insert", place: plan.values.name, changedFields: plan.changedFields }));
    }

    if (!dryRun && plans.length) {
      await client.query("BEGIN");
      try {
        for (const plan of plans) await writePlan(client, plan);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    const inserts = plans.filter((plan) => !plan.existing).length;
    const updates = plans.length - inserts;
    console.log(`${dryRun ? "Dry run" : "Sync"} complete: ${inserts} inserts; ${updates} updates; ${skipped} rows skipped.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`Places sync failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
