import { pool } from "../integrations/postgres.js";
import { changedEditorialFields } from "../logic/editorialLocks.js";
import type { PoolClient } from "pg";

export const EDITORIAL_EDITABLE_FIELDS = [
  "name", "neighbourhood", "area", "categories", "subcategories",
  "short_description_en", "short_description_fr", "practical_info_en", "practical_info_fr",
  "personal_tip_en", "personal_tip_fr", "price_level", "vibe", "vibe_tags", "amenities",
  "instagram_url", "facebook_url", "tiktok_url", "google_maps_url",
  "offscript_pick_level", "offscript_priority", "offscript_reason_nl", "offscript_reason_en",
  "offscript_reason_fr", "authenticity", "food_orientation", "audience_orientation",
  "audience_tags", "adventure_level", "occasion_tags", "dietary_tags", "work_friendly", "status"
] as const;
export type EditorialEditableField = typeof EDITORIAL_EDITABLE_FIELDS[number];
export type EditorialPlaceUpdate = Record<EditorialEditableField, string | number | boolean | null | string[]>;

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
  dietaryTags: string[];
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
  images: PlaceAdminImage[];
  video: PlaceAdminVideo | null;
  feedback: PlaceAdminFeedback[];
  createdAt: string;
  editorialLockedFields: string[];
  editorialUpdatedAt: string | null;
  editorialUpdatedBy: string | null;
  statusBeforeArchive: string | null;
  archivedAt: string | null;
};

export type PlaceAdminFeedback = {
  id: string;
  rating: "loved" | "okay" | "disliked" | "did_not_go";
  reason: string | null;
  freeText: string | null;
  positiveDetail: string | null;
  travellerType: string | null;
  requestedVibe: string | null;
  createdAt: string;
};

export type PlaceAdminImage = {
  id: string;
  url: string;
  altText: string | null;
  caption: string | null;
  isHeroImage: boolean;
  sortOrder: number;
  source: "field_research" | "dashboard" | null;
  cloudinaryPublicId: string | null;
  originalFilename: string | null;
  width: number | null;
  height: number | null;
};

export type NewDashboardImage = {
  url: string;
  cloudinaryPublicId: string;
  originalFilename: string;
  width: number;
  height: number;
};

export type PlaceAdminVideo = {
  id: string;
  url: string;
  cloudinaryPublicId: string;
  posterUrl: string;
  originalFilename: string;
  width: number;
  height: number;
  durationSeconds: number;
  format: string;
  fileSizeBytes: number;
  source: "dashboard";
  createdAt: string;
  updatedAt: string;
};

export type NewDashboardVideo = Omit<PlaceAdminVideo, "id" | "source" | "createdAt" | "updatedAt">;

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

  const full = await pool.query(`SELECT p.*, image_data.images, feedback_data.feedback,
    (SELECT row_to_json(video_row) FROM (
      SELECT id, url, cloudinary_public_id AS "cloudinaryPublicId", poster_url AS "posterUrl",
        original_filename AS "originalFilename", width, height,
        duration_seconds::float8 AS "durationSeconds", format,
        file_size_bytes::float8 AS "fileSizeBytes", source,
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM public.place_videos WHERE place_id = p.id LIMIT 1
    ) video_row) AS video
    FROM public.places p,
    LATERAL (SELECT COALESCE(json_agg(json_build_object('id', pi.id, 'url', pi.url, 'altText', pi.alt_text, 'caption', pi.caption, 'isHeroImage', pi.is_hero_image, 'sortOrder', pi.sort_order, 'source', pi.source, 'cloudinaryPublicId', pi.cloudinary_public_id, 'originalFilename', pi.original_filename, 'width', pi.width, 'height', pi.height) ORDER BY pi.sort_order, pi.created_at), '[]') AS images FROM public.place_images pi WHERE pi.place_id = p.id) image_data
    CROSS JOIN LATERAL (SELECT COALESCE(json_agg(json_build_object('id', rf.id, 'rating', rf.rating, 'reason', rf.reason, 'freeText', rf.free_text, 'positiveDetail', rf.positive_detail, 'travellerType', rf.traveller_type, 'requestedVibe', rf.requested_vibe, 'createdAt', rf.created_at) ORDER BY rf.created_at DESC), '[]') AS feedback FROM public.recommendation_feedback rf WHERE rf.place_id = p.id) feedback_data
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
    dietaryTags: stringArray(row.dietary_tags),
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
    video: row.video ?? null,
    feedback: Array.isArray(row.feedback) ? row.feedback.map((item: Record<string, unknown>) => ({
      id: String(item.id), rating: String(item.rating) as PlaceAdminFeedback["rating"],
      reason: item.reason === null ? null : String(item.reason),
      freeText: item.freeText === null ? null : String(item.freeText),
      positiveDetail: item.positiveDetail === null ? null : String(item.positiveDetail),
      travellerType: item.travellerType === null ? null : String(item.travellerType),
      requestedVibe: item.requestedVibe === null ? null : String(item.requestedVibe),
      createdAt: new Date(String(item.createdAt)).toISOString()
    })) : [],
    createdAt: new Date(row.created_at).toISOString(),
    editorialLockedFields: stringArray(row.editorial_locked_fields),
    editorialUpdatedAt: row.editorial_updated_at ? new Date(row.editorial_updated_at).toISOString() : null,
    editorialUpdatedBy: row.editorial_updated_by,
    statusBeforeArchive: row.status_before_archive,
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null
  };
}

async function syncEditorialSubcategories(client: PoolClient, placeId: string, names: string[]): Promise<void> {
  await client.query(
    `DELETE FROM public.place_subcategories WHERE place_id = $1 AND NOT (name = ANY($2::text[]))`,
    [placeId, names]
  );
  for (const [index, name] of names.entries()) {
    await client.query(
      `INSERT INTO public.place_subcategories (place_id, name, display_order)
       VALUES ($1,$2,$3)
       ON CONFLICT (place_id,name) DO UPDATE SET display_order=EXCLUDED.display_order`,
      [placeId, name, index]
    );
  }
}

export async function updatePlaceEditorial(
  placeId: string,
  submitted: EditorialPlaceUpdate,
  updatedBy: string
): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query<Record<string, unknown>>(
      "SELECT * FROM public.places WHERE id=$1 FOR UPDATE",
      [placeId]
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("Place not found.");
    const changed = changedEditorialFields(current, submitted, EDITORIAL_EDITABLE_FIELDS);
    if (!changed.length) {
      await client.query("COMMIT");
      return [];
    }
    const values = changed.map((field) => submitted[field as EditorialEditableField]);
    const assignments = changed.map((field, index) => `${field}=$${index + 1}`);
    await client.query(
      `UPDATE public.places SET ${assignments.join(", ")},
       editorial_locked_fields=(SELECT ARRAY(SELECT DISTINCT unnest(editorial_locked_fields || $${values.length + 1}::text[]))),
       editorial_updated_at=NOW(), editorial_updated_by=$${values.length + 2}, updated_at=NOW()
       WHERE id=$${values.length + 3}`,
      [...values, changed, updatedBy, placeId]
    );
    if (changed.includes("subcategories")) {
      await syncEditorialSubcategories(client, placeId, submitted.subcategories as string[]);
    }
    await client.query("COMMIT");
    return changed;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function unlockPlaceEditorialField(placeId: string, field: EditorialEditableField, updatedBy: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE public.places SET editorial_locked_fields=array_remove(editorial_locked_fields,$1),
     editorial_updated_at=NOW(), editorial_updated_by=$2, updated_at=NOW()
     WHERE id=$3 AND $1=ANY(editorial_locked_fields)`,
    [field, updatedBy, placeId]
  );
  return result.rowCount === 1;
}

export async function archivePlace(placeId: string, updatedBy: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE public.places SET status_before_archive=CASE WHEN status <> 'archived' THEN status ELSE status_before_archive END,
     status='archived', archived_at=COALESCE(archived_at,NOW()), editorial_updated_at=NOW(),
     editorial_updated_by=$2, updated_at=NOW()
     WHERE id=$1 AND status <> 'archived'`,
    [placeId, updatedBy]
  );
  return result.rowCount === 1;
}

export async function restorePlace(placeId: string, updatedBy: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE public.places SET status=COALESCE(NULLIF(status_before_archive,'archived'),'draft'),
     status_before_archive=NULL, archived_at=NULL, editorial_updated_at=NOW(),
     editorial_updated_by=$2, updated_at=NOW()
     WHERE id=$1 AND status='archived'`,
    [placeId, updatedBy]
  );
  return result.rowCount === 1;
}

export async function addDashboardPlaceImage(placeId: string, image: NewDashboardImage): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM public.places WHERE id = $1 FOR UPDATE", [placeId]);
    const order = await client.query<{ next: number }>("SELECT COALESCE(MAX(sort_order), -1)::int + 1 AS next FROM public.place_images WHERE place_id = $1", [placeId]);
    const hasHero = await client.query<{ exists: boolean }>("SELECT EXISTS(SELECT 1 FROM public.place_images WHERE place_id = $1 AND is_hero_image) AS exists", [placeId]);
    await client.query(`INSERT INTO public.place_images
      (place_id, url, sort_order, is_hero_image, cloudinary_public_id, original_filename, width, height, source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'dashboard')`,
      [placeId, image.url, order.rows[0]?.next ?? 0, !hasHero.rows[0]?.exists, image.cloudinaryPublicId, image.originalFilename, image.width, image.height]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function setPlaceCoverImage(placeId: string, imageId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const image = await client.query("SELECT id FROM public.place_images WHERE id = $1 AND place_id = $2 FOR UPDATE", [imageId, placeId]);
    if (!image.rowCount) { await client.query("ROLLBACK"); return false; }
    await client.query("UPDATE public.place_images SET is_hero_image = false WHERE place_id = $1 AND is_hero_image", [placeId]);
    await client.query("UPDATE public.place_images SET is_hero_image = true WHERE id = $1 AND place_id = $2", [imageId, placeId]);
    await client.query("COMMIT");
    return true;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function reorderPlaceImages(placeId: string, imageIds: string[]): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ id: string }>("SELECT id FROM public.place_images WHERE place_id = $1 ORDER BY sort_order FOR UPDATE", [placeId]);
    const currentIds = current.rows.map((row) => row.id);
    if (currentIds.length !== imageIds.length || new Set(imageIds).size !== imageIds.length || currentIds.some((id) => !imageIds.includes(id))) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("UPDATE public.place_images SET sort_order = sort_order - 1000000 WHERE place_id = $1", [placeId]);
    for (const [index, id] of imageIds.entries()) {
      await client.query("UPDATE public.place_images SET sort_order = $1 WHERE id = $2 AND place_id = $3", [index, id, placeId]);
    }
    await client.query("COMMIT");
    return true;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function removePlaceImageRelationship(placeId: string, imageId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const removed = await client.query<{ is_hero_image: boolean }>("DELETE FROM public.place_images WHERE id = $1 AND place_id = $2 RETURNING is_hero_image", [imageId, placeId]);
    if (!removed.rowCount) { await client.query("ROLLBACK"); return false; }
    if (removed.rows[0]?.is_hero_image) {
      await client.query("UPDATE public.place_images SET is_hero_image = true WHERE id = (SELECT id FROM public.place_images WHERE place_id = $1 ORDER BY sort_order, created_at LIMIT 1)", [placeId]);
    }
    const remaining = await client.query<{ id: string }>("SELECT id FROM public.place_images WHERE place_id = $1 ORDER BY sort_order, created_at", [placeId]);
    await client.query("UPDATE public.place_images SET sort_order = sort_order - 1000000 WHERE place_id = $1", [placeId]);
    for (const [index, row] of remaining.rows.entries()) {
      await client.query("UPDATE public.place_images SET sort_order = $1 WHERE id = $2", [index, row.id]);
    }
    await client.query("COMMIT");
    return true;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function replaceDashboardPlaceVideo(placeId: string, video: NewDashboardVideo): Promise<{ replacedPublicId: string | null }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const place = await client.query("SELECT id FROM public.places WHERE id = $1 FOR UPDATE", [placeId]);
    if (!place.rowCount) throw new Error("Place not found.");
    const existing = await client.query<{ cloudinary_public_id: string }>(
      "SELECT cloudinary_public_id FROM public.place_videos WHERE place_id = $1 FOR UPDATE",
      [placeId]
    );
    await client.query(`
      INSERT INTO public.place_videos
        (place_id, url, cloudinary_public_id, poster_url, original_filename, width, height,
         duration_seconds, format, file_size_bytes, source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'dashboard')
      ON CONFLICT (place_id) DO UPDATE SET
        url = EXCLUDED.url,
        cloudinary_public_id = EXCLUDED.cloudinary_public_id,
        poster_url = EXCLUDED.poster_url,
        original_filename = EXCLUDED.original_filename,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        duration_seconds = EXCLUDED.duration_seconds,
        format = EXCLUDED.format,
        file_size_bytes = EXCLUDED.file_size_bytes,
        source = 'dashboard',
        created_at = NOW(),
        updated_at = NOW()
    `, [placeId, video.url, video.cloudinaryPublicId, video.posterUrl, video.originalFilename,
      video.width, video.height, video.durationSeconds, video.format, video.fileSizeBytes]);
    await client.query("COMMIT");
    return { replacedPublicId: existing.rows[0]?.cloudinary_public_id ?? null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function removePlaceVideoRelationship(placeId: string, videoId: string): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM public.place_videos WHERE id = $1 AND place_id = $2",
    [videoId, placeId]
  );
  return result.rowCount === 1;
}
