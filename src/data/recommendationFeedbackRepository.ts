import { resolveUserIdentity } from "./whatsappUsersRepository.js";
import { pool } from "../integrations/postgres.js";
import type { UserContext } from "../types/userContext.js";
import type { RecommendationFeedbackRating, RecommendationFeedbackReason } from "../logic/recommendationFeedback.js";

export type PendingRecommendationFeedback = {
  id: string;
  rating: RecommendationFeedbackRating;
  reason?: RecommendationFeedbackReason;
  awaitingPositiveDetail: boolean;
};

export async function createRecommendationFeedback(input: {
  userPhone: string;
  placeId: string | null;
  placeName: string;
  rating: RecommendationFeedbackRating;
  context: UserContext;
  acquisitionSourceId?: string;
  freeText?: string;
  reason?: RecommendationFeedbackReason;
  complete?: boolean;
}): Promise<void> {
  const { userId } = await resolveUserIdentity(input.userPhone);
  await pool.query(
    `INSERT INTO public.recommendation_feedback (
       user_phone, place_id, place_name, rating, traveller_type, requested_vibe,
       context_snapshot, acquisition_source_id, free_text, awaiting_positive_detail, reason, user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)`,
    [input.userPhone, input.placeId, input.placeName, input.rating,
      input.context.travellerType ?? null, input.context.vibe ?? input.context.requestedStyle ?? null,
      JSON.stringify(input.context), input.acquisitionSourceId ?? null, input.freeText ?? null,
      input.rating === "loved" && !input.complete, input.reason ?? null, userId]
  );
}

export async function getPendingRecommendationFeedback(userPhone: string): Promise<PendingRecommendationFeedback | null> {
  const result = await pool.query<{
    id: string;
    rating: RecommendationFeedbackRating;
    reason: RecommendationFeedbackReason | null;
    awaiting_positive_detail: boolean;
  }>(
    `SELECT id, rating, reason, awaiting_positive_detail FROM public.recommendation_feedback
     WHERE user_phone = $1 AND conversation_closed = false AND (
       awaiting_positive_detail = true OR
       (rating IN ('okay', 'disliked') AND (reason IS NULL OR (reason = 'something_else' AND free_text IS NULL)))
     )
     ORDER BY created_at DESC LIMIT 1`,
    [userPhone]
  );
  const row = result.rows[0];
  return row ? {
    id: row.id,
    rating: row.rating,
    reason: row.reason ?? undefined,
    awaitingPositiveDetail: row.awaiting_positive_detail
  } : null;
}

export async function setRecommendationFeedbackReason(id: string, reason: RecommendationFeedbackReason): Promise<void> {
  await pool.query(`UPDATE public.recommendation_feedback SET reason = $2, updated_at = NOW() WHERE id = $1`, [id, reason]);
}

export async function setRecommendationFeedbackFreeText(id: string, freeText: string): Promise<void> {
  await pool.query(`UPDATE public.recommendation_feedback SET free_text = $2, updated_at = NOW() WHERE id = $1`, [id, freeText]);
}

export async function setPositiveRecommendationFeedbackDetail(id: string, detail: string): Promise<void> {
  await pool.query(
    `UPDATE public.recommendation_feedback
     SET positive_detail = $2, awaiting_positive_detail = false, updated_at = NOW()
     WHERE id = $1`,
    [id, detail]
  );
}

export async function listFeedbackPlaces(): Promise<Array<{ id: string; name: string }>> {
  const result = await pool.query<{ id: string; name: string }>("SELECT id, name FROM public.places ORDER BY name");
  return result.rows;
}

export async function closePendingFeedbackConversation(userPhone: string): Promise<void> {
  await pool.query(
    "UPDATE public.recommendation_feedback SET conversation_closed = true, awaiting_positive_detail = false, updated_at = NOW() WHERE user_phone = $1 AND conversation_closed = false",
    [userPhone]
  );
}
