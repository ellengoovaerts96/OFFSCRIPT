import { pool } from "../integrations/postgres.js";
import type { Place, PlaceCategory, PlaceImage } from "../types/place.js";

type PlaceRow = {
  id: string;
  name: string;
  country: "Senegal";
  region: string;
  neighbourhood: string | null;
  categories: PlaceCategory[] | null;
  subcategories: string[] | null;
  short_description: string;
  long_description: string | null;
  personal_tip: string | null;
  why_hidden_gem: string | null;
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

function mapPlace(row: PlaceRow): Place {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    region: row.region,
    neighbourhood: row.neighbourhood ?? undefined,
    categories: row.categories ?? [],
    subcategories: row.subcategories ?? [],
    shortDescription: row.short_description,
    longDescription: row.long_description ?? undefined,
    personalTip: row.personal_tip ?? undefined,
    whyHiddenGem: row.why_hidden_gem ?? undefined,
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
    COALESCE(
      json_agg(
        json_build_object(
          'id', pi.id,
          'url', pi.url,
          'altText', pi.alt_text,
          'caption', pi.caption,
          'isHeroImage', pi.is_hero_image
        )
        ORDER BY pi.is_hero_image DESC, pi.created_at ASC
      ) FILTER (WHERE pi.id IS NOT NULL),
      '[]'
    ) AS images
  FROM places p
  LEFT JOIN place_images pi
    ON pi.place_id = p.id
   AND pi.usage_allowed = true
`;

export async function listRecommendationPlaces(): Promise<Place[]> {
  const result = await pool.query<PlaceRow>(`
    ${placeSelect}
    WHERE p.status IN ('ready', 'premium')
    GROUP BY p.id
    ORDER BY p.status DESC, p.name ASC
  `);

  return result.rows.map(mapPlace);
}

export async function getPlaceById(id: string): Promise<Place | null> {
  const result = await pool.query<PlaceRow>(
    `
      ${placeSelect}
      WHERE p.id = $1
        AND p.status IN ('ready', 'premium')
      GROUP BY p.id
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] ? mapPlace(result.rows[0]) : null;
}
