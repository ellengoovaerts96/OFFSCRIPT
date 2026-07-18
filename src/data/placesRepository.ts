import { pool } from "../integrations/postgres.js";
import type { Place, PlaceCategory, PlaceImage, PlaceSubcategory } from "../types/place.js";

type PlaceRow = {
  id: string;
  name: string;
  country: string;
  region: string;
  neighbourhood: string | null;
  area: string | null;
  exact_area: string | null;
  vibe: string | null;
  categories: PlaceCategory[] | null;
  legacy_subcategories: string[] | null;
  subcategories: PlaceSubcategory[] | null;
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
  transport: string | null;
  best_for: string[] | null;
  not_ideal_for: string[] | null;
  traveller_types: string[] | null;
  child_friendly: boolean;
  child_notes: string | null;
  best_timing: string[] | null;
  opening_hours: string | null;
  closed_days: string[] | null;
  price_level: Place["priceLevel"] | null;
  payment_notes: string | null;
  reservation_needed: boolean;
  reservation_method: Place["reservationMethod"] | null;
  reservation_contact_name: string | null;
  reservation_phone: string | null;
  reservation_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  google_maps_url: string;
  latitude: number | null;
  longitude: number | null;
  transport_notes: string | null;
  taxi_notes: string | null;
  parking_notes: string | null;
  safety_notes: string | null;
  guide_available: boolean;
  guide_name: string | null;
  guide_phone: string | null;
  guide_languages: string[] | null;
  status: Place["status"];
  images: PlaceImage[] | null;
};

function mergeSubcategories(row: PlaceRow): PlaceSubcategory[] {
  const normalizedSubcategories = row.subcategories ?? [];
  const existingNames = new Set(normalizedSubcategories.map((subcategory) => subcategory.name.trim().toLowerCase()));
  const legacySubcategories = (row.legacy_subcategories ?? [])
    .filter((name) => name.trim())
    .filter((name) => !existingNames.has(name.trim().toLowerCase()))
    .map((name, index) => ({
      id: `legacy-${row.id}-${index}`,
      name,
      displayOrder: normalizedSubcategories.length + index + 1,
      images: []
    }));

  return [...normalizedSubcategories, ...legacySubcategories];
}

function localizedText(
  language: string,
  english: string | null,
  french: string | null,
  legacy?: string | null
): string | undefined {
  const value = language.toLowerCase().startsWith("en")
    ? english ?? french ?? legacy
    : french ?? english ?? legacy;

  return value ?? undefined;
}

function mapPlace(row: PlaceRow, language = "fr"): Place {
  const shortDescription = localizedText(
    language,
    row.short_description_en,
    row.short_description_fr,
    row.short_description
  );

  return {
    id: row.id,
    name: row.name,
    country: row.country,
    region: row.region,
    neighbourhood: row.neighbourhood ?? undefined,
    area: row.area ?? undefined,
    exactArea: row.exact_area ?? undefined,
    vibe: row.vibe ?? undefined,
    categories: row.categories ?? [],
    subcategories: mergeSubcategories(row),
    shortDescription: shortDescription ?? row.short_description,
    practicalInfo: localizedText(language, row.practical_info_en, row.practical_info_fr, row.practical_info),
    personalTip: localizedText(language, row.personal_tip_en, row.personal_tip_fr, row.personal_tip),
    story: localizedText(language, row.story_en, row.story_fr),
    transport: row.transport ?? undefined,
    bestFor: row.best_for ?? [],
    notIdealFor: row.not_ideal_for ?? [],
    travellerTypes: row.traveller_types ?? [],
    childFriendly: row.child_friendly,
    childNotes: row.child_notes ?? undefined,
    bestTiming: row.best_timing ?? [],
    openingHours: row.opening_hours ?? undefined,
    closedDays: row.closed_days ?? [],
    priceLevel: row.price_level ?? undefined,
    paymentNotes: row.payment_notes ?? undefined,
    reservationNeeded: row.reservation_needed,
    reservationMethod: row.reservation_method ?? undefined,
    reservationContactName: row.reservation_contact_name ?? undefined,
    reservationPhone: row.reservation_phone ?? undefined,
    reservationUrl: row.reservation_url ?? undefined,
    facebookUrl: row.facebook_url ?? undefined,
    instagramUrl: row.instagram_url ?? undefined,
    tiktokUrl: row.tiktok_url ?? undefined,
    googleMapsUrl: row.google_maps_url,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    transportNotes: row.transport_notes ?? undefined,
    taxiNotes: row.taxi_notes ?? undefined,
    parkingNotes: row.parking_notes ?? undefined,
    safetyNotes: row.safety_notes ?? undefined,
    guideAvailable: row.guide_available,
    guideName: row.guide_name ?? undefined,
    guidePhone: row.guide_phone ?? undefined,
    guideLanguages: row.guide_languages ?? [],
    images: row.images ?? [],
    status: row.status
  };
}

const placeSelect = `
  SELECT
    p.*,
    p.subcategories AS legacy_subcategories,
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', pi.id,
            'url', pi.url,
            'altText', pi.alt_text,
            'caption', pi.caption,
            'isHeroImage', pi.is_hero_image
          )
          ORDER BY pi.is_hero_image DESC, pi.sort_order ASC, pi.created_at ASC
        )
        FROM place_images pi
        WHERE pi.place_id = p.id
      ),
      '[]'
    ) AS images,
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', ps.id,
            'name', ps.name,
            'description', ps.description,
            'displayOrder', ps.display_order,
            'images', COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', psi.id,
                    'url', psi.url,
                    'altText', psi.alt_text,
                    'caption', psi.caption,
                    'isHeroImage', psi.is_hero_image
                  )
                  ORDER BY psi.is_hero_image DESC, psi.created_at ASC
                )
                FROM place_subcategory_images psi
                WHERE psi.place_subcategory_id = ps.id
              ),
              '[]'
            )
          )
          ORDER BY ps.display_order ASC, ps.name ASC
        )
        FROM place_subcategories ps
        WHERE ps.place_id = p.id
      ),
      '[]'
    ) AS subcategories
  FROM places p
`;

export async function listRecommendationPlaces(language = "fr"): Promise<Place[]> {
  const result = await pool.query<PlaceRow>(`
    ${placeSelect}
    WHERE p.status <> 'archived'
    ORDER BY p.status DESC, p.name ASC
  `);

  return result.rows.map((row) => mapPlace(row, language));
}

export async function getPlaceById(id: string, language = "fr"): Promise<Place | null> {
  const result = await pool.query<PlaceRow>(
    `
      ${placeSelect}
      WHERE p.id = $1
        AND p.status <> 'archived'
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] ? mapPlace(result.rows[0], language) : null;
}
