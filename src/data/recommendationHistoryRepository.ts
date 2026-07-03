import { pool } from "../integrations/postgres.js";

export type RecommendedPlaceHistoryItem = {
  placeId: string | null;
  placeName: string;
};

function isUndefinedTableError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "42P01");
}

export async function recordPlaceRecommendation(input: {
  userPhone: string;
  placeId: string;
  placeName: string;
}): Promise<void> {
  try {
    await pool.query(
      `
        INSERT INTO place_recommendation_history (user_phone, place_id, place_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_phone, place_id)
        DO UPDATE SET
          place_name = EXCLUDED.place_name,
          created_at = NOW()
      `,
      [input.userPhone, input.placeId, input.placeName]
    );
  } catch (error) {
    if (!isUndefinedTableError(error)) throw error;
  }
}

export async function listRecommendedPlaceIds(userPhone: string): Promise<string[]> {
  try {
    const result = await pool.query<{ place_id: string | null }>(
      `
        SELECT place_id
        FROM place_recommendation_history
        WHERE user_phone = $1
          AND place_id IS NOT NULL
      `,
      [userPhone]
    );

    return result.rows.flatMap((row) => (row.place_id ? [row.place_id] : []));
  } catch (error) {
    if (isUndefinedTableError(error)) return [];
    throw error;
  }
}

export async function deleteRecommendationHistoryForUser(userPhone: string): Promise<void> {
  try {
    await pool.query(
      `
        DELETE FROM place_recommendation_history
        WHERE user_phone = $1
      `,
      [userPhone]
    );
  } catch (error) {
    if (!isUndefinedTableError(error)) throw error;
  }
}

export async function getLastRecommendedPlace(userPhone: string): Promise<RecommendedPlaceHistoryItem | null> {
  try {
    const result = await pool.query<{ place_id: string | null; place_name: string }>(
      `
        SELECT place_id, place_name
        FROM place_recommendation_history
        WHERE user_phone = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [userPhone]
    );

    const row = result.rows[0];
    return row ? { placeId: row.place_id, placeName: row.place_name } : null;
  } catch (error) {
    if (isUndefinedTableError(error)) return null;
    throw error;
  }
}
