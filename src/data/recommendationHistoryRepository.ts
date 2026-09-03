import { pool } from "../integrations/postgres.js";
import type { UserContext } from "../types/userContext.js";

export type RecommendedPlaceHistoryItem = {
  placeId: string | null;
  placeName: string;
  contextSnapshot?: UserContext;
};

function isUndefinedTableError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "42P01");
}

function isUndefinedColumnError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "42703");
}

export async function recordPlaceRecommendation(input: {
  userPhone: string;
  placeId: string;
  placeName: string;
  context: UserContext;
}): Promise<void> {
  try {
    await pool.query(
      `
        INSERT INTO place_recommendation_history (user_phone, place_id, place_name, context_snapshot)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (user_phone, place_id)
        DO UPDATE SET
          place_name = EXCLUDED.place_name,
          context_snapshot = EXCLUDED.context_snapshot,
          created_at = NOW()
      `,
      [input.userPhone, input.placeId, input.placeName, JSON.stringify(input.context)]
    );
  } catch (error) {
    if (isUndefinedColumnError(error)) {
      await pool.query(
        `
          INSERT INTO place_recommendation_history (user_phone, place_id, place_name)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_phone, place_id)
          DO UPDATE SET place_name = EXCLUDED.place_name, created_at = NOW()
        `,
        [input.userPhone, input.placeId, input.placeName]
      );
      return;
    }
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
    const result = await pool.query<{
      place_id: string | null;
      place_name: string;
      context_snapshot: UserContext | null;
    }>(
      `
        SELECT place_id, place_name, context_snapshot
        FROM place_recommendation_history
        WHERE user_phone = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [userPhone]
    );

    const row = result.rows[0];
    return row ? {
      placeId: row.place_id,
      placeName: row.place_name,
      contextSnapshot: row.context_snapshot ?? undefined
    } : null;
  } catch (error) {
    if (isUndefinedColumnError(error)) {
      const legacyResult = await pool.query<{ place_id: string | null; place_name: string }>(
        `
          SELECT place_id, place_name
          FROM place_recommendation_history
          WHERE user_phone = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [userPhone]
      );
      const legacyRow = legacyResult.rows[0];
      return legacyRow ? { placeId: legacyRow.place_id, placeName: legacyRow.place_name } : null;
    }
    if (isUndefinedTableError(error)) return null;
    throw error;
  }
}
