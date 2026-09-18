import { pool } from "../integrations/postgres.js";

export type PlaceAdminFilters = {
  search?: string;
  neighbourhood?: string;
  category?: string;
  status?: string;
};

export type PlaceAdminSummary = {
  id: string;
  name: string;
  region: string;
  neighbourhood: string | null;
  area: string | null;
  categories: string[];
  subcategories: string[];
  status: string;
  offscriptPickLevel: number;
  offscriptPriority: number;
  imageCount: number;
  updatedAt: string;
};

export type PlaceAdminFilterOptions = {
  neighbourhoods: string[];
  categories: string[];
  statuses: string[];
};

export type PlaceAdminDetail = PlaceAdminSummary & {
  country: string;
  shortDescription: string;
  shortDescriptionEn: string | null;
  shortDescriptionFr: string | null;
  practicalInfo: string | null;
  practicalInfoEn: string | null;
  practicalInfoFr: string | null;
  personalTip: string | null;
  personalTipEn: string | null;
  personalTipFr: string | null;
  offscriptReasonNl: string | null;
  offscriptReasonEn: string | null;
  offscriptReasonFr: string | null;
  authenticity: number | null;
  foodOrientation: number | null;
  audienceOrientation: number | null;
  audienceTags: string[];
  adventureLevel: number | null;
  occasionTags: string[];
  amenities: string[];
  workFriendly: boolean | null;
  priceLevel: number | null;
  vibe: string | null;
  vibeTags: string[];
  bestFor: string[];
  notIdealFor: string[];
  travellerTypes: string[];
  bestTiming: string[];
  openingHours: string | null;
  googleMapsUrl: string;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  lastVerifiedAt: string | null;
  source: string | null;
  images: Array<{ id: string; url: string; altText: string | null; caption: string | null; isHeroImage: boolean }>;
  createdAt: string;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function summary(row: Record<string, unknown>): PlaceAdminSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    region: String(row.region),
    neighbourhood: row.neighbourhood === null ? null : String(row.neighbourhood),
    area: row.area === null ? null : String(row.area),
    categories: stringArray(row.categories),
    subcategories: stringArray(row.subcategories),
    status: String(row.status),
    offscriptPickLevel: Number(row.offscript_pick_level ?? 0),
    offscriptPriority: Number(row.offscript_priority ?? 0),
    imageCount: Number(row.image_count ?? 0),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

const summarySelect = `
  SELECT p.id, p.name, p.region, p.neighbourhood, p.area, p.categories,
    COALESCE((SELECT array_agg(ps.name ORDER BY ps.display_order, ps.name) FROM public.place_subcategories ps WHERE ps.place_id = p.id), p.subcategories, '{}') AS subcategories,
    p.status, p.offscript_pick_level, p.offscript_priority, p.updated_at,
    (SELECT COUNT(*)::int FROM public.place_images pi WHERE pi.place_id = p.id) +
    (SELECT COUNT(*)::int FROM public.place_subcategory_images psi JOIN public.place_subcategories ps ON ps.id = psi.place_subcategory_id WHERE ps.place_id = p.id) AS image_count
  FROM public.places p`;

export async function listPlacesForAdmin(filters: PlaceAdminFilters): Promise<PlaceAdminSummary[]> {
  const values: string[] = [];
  const where: string[] = [];
  const add = (value: string): string => { values.push(value); return `$${values.length}`; };
  if (filters.search) {
    const parameter = add(`%${filters.search}%`);
    where.push(`(p.name ILIKE ${parameter} OR p.region ILIKE ${parameter} OR COALESCE(p.neighbourhood, '') ILIKE ${parameter} OR COALESCE(p.area, '') ILIKE ${parameter})`);
  }
  if (filters.neighbourhood) where.push(`p.neighbourhood = ${add(filters.neighbourhood)}`);
  if (filters.category) where.push(`${add(filters.category)} = ANY(p.categories)`);
  if (filters.status) where.push(`p.status = ${add(filters.status)}`);
  const result = await pool.query(`${summarySelect}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY p.name`, values);
  return result.rows.map(summary);
}

export async function placeAdminFilterOptions(): Promise<PlaceAdminFilterOptions> {
  const result = await pool.query(`
    SELECT
      ARRAY(SELECT DISTINCT neighbourhood FROM public.places WHERE neighbourhood IS NOT NULL AND btrim(neighbourhood) <> '' ORDER BY neighbourhood) AS neighbourhoods,
      ARRAY(SELECT DISTINCT unnest(categories) FROM public.places ORDER BY 1) AS categories,
      ARRAY(SELECT DISTINCT status FROM public.places WHERE status IS NOT NULL ORDER BY status) AS statuses
  `);
  const row = result.rows[0] ?? {};
  return { neighbourhoods: stringArray(row.neighbourhoods), categories: stringArray(row.categories), statuses: stringArray(row.statuses) };
}

export async function getPlaceForAdmin(id: string): Promise<PlaceAdminDetail | null> {
  const result = await pool.query(`${summarySelect} WHERE p.id = $1`, [id]);
  if (!result.rows[0]) return null;

  const full = await pool.query(`SELECT p.*, image_data.images FROM public.places p,
    LATERAL (SELECT COALESCE(json_agg(json_build_object('id', pi.id, 'url', pi.url, 'altText', pi.alt_text, 'caption', pi.caption, 'isHeroImage', pi.is_hero_image) ORDER BY pi.is_hero_image DESC, pi.sort_order, pi.created_at), '[]') AS images FROM public.place_images pi WHERE pi.place_id = p.id) image_data
    WHERE p.id = $1`, [id]);
  const row = full.rows[0];
  const base = summary(result.rows[0]);
  return {
    ...base,
    country: row.country,
    shortDescription: row.short_description,
    shortDescriptionEn: row.short_description_en,
    shortDescriptionFr: row.short_description_fr,
    practicalInfo: row.practical_info,
    practicalInfoEn: row.practical_info_en,
    practicalInfoFr: row.practical_info_fr,
    personalTip: row.personal_tip,
    personalTipEn: row.personal_tip_en,
    personalTipFr: row.personal_tip_fr,
    offscriptReasonNl: row.offscript_reason_nl,
    offscriptReasonEn: row.offscript_reason_en,
    offscriptReasonFr: row.offscript_reason_fr,
    authenticity: row.authenticity,
    foodOrientation: row.food_orientation,
    audienceOrientation: row.audience_orientation,
    audienceTags: stringArray(row.audience_tags),
    adventureLevel: row.adventure_level,
    occasionTags: stringArray(row.occasion_tags),
    amenities: stringArray(row.amenities),
    workFriendly: row.work_friendly,
    priceLevel: row.price_level,
    vibe: row.vibe,
    vibeTags: stringArray(row.vibe_tags),
    bestFor: stringArray(row.best_for),
    notIdealFor: stringArray(row.not_ideal_for),
    travellerTypes: stringArray(row.traveller_types),
    bestTiming: stringArray(row.best_timing),
    openingHours: row.opening_hours,
    googleMapsUrl: row.google_maps_url,
    instagramUrl: row.instagram_url,
    facebookUrl: row.facebook_url,
    tiktokUrl: row.tiktok_url,
    latitude: row.latitude,
    longitude: row.longitude,
    lastVerifiedAt: row.last_verified_at ? new Date(row.last_verified_at).toISOString() : null,
    source: row.source,
    images: Array.isArray(row.images) ? row.images : [],
    createdAt: new Date(row.created_at).toISOString()
  };
}
