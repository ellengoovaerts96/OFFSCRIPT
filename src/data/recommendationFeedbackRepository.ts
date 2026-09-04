import { pool } from "../integrations/postgres.js";
import type { UserContext } from "../types/userContext.js";
import type { RecommendationFeedbackRating, RecommendationFeedbackReason } from "../logic/recommendationFeedback.js";

export type PendingRecommendationFeedback = {
  id: string;
  rating: RecommendationFeedbackRating;
  reason?: RecommendationFeedbackReason;
};

export async function createRecommendationFeedback(input: {
  userPhone: string;
  placeId: string | null;
  placeName: string;
  rating: RecommendationFeedbackRating;
  context: UserContext;
  acquisitionSourceId?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO public.recommendation_feedback (
       user_phone, place_id, place_name, rating, traveller_type, requested_vibe,
       context_snapshot, acquisition_source_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [input.userPhone, input.placeId, input.placeName, input.rating,
      input.context.travellerType ?? null, input.context.vibe ?? input.context.requestedStyle ?? null,
      JSON.stringify(input.context), input.acquisitionSourceId ?? null]
  );
}

export async function getPendingRecommendationFeedback(userPhone: string): Promise<PendingRecommendationFeedback | null> {
  const result = await pool.query<{ id: string; rating: RecommendationFeedbackRating; reason: RecommendationFeedbackReason | null }>(
    `SELECT id, rating, reason FROM public.recommendation_feedback
     WHERE user_phone = $1 AND rating IN ('okay', 'disliked')
       AND (reason IS NULL OR (reason = 'something_else' AND free_text IS NULL))
     ORDER BY created_at DESC LIMIT 1`,
    [userPhone]
  );
  const row = result.rows[0];
  return row ? { id: row.id, rating: row.rating, reason: row.reason ?? undefined } : null;
}

export async function setRecommendationFeedbackReason(id: string, reason: RecommendationFeedbackReason): Promise<void> {
  await pool.query(`UPDATE public.recommendation_feedback SET reason = $2, updated_at = NOW() WHERE id = $1`, [id, reason]);
}

export async function setRecommendationFeedbackFreeText(id: string, freeText: string): Promise<void> {
  await pool.query(`UPDATE public.recommendation_feedback SET free_text = $2, updated_at = NOW() WHERE id = $1`, [id, freeText]);
}
