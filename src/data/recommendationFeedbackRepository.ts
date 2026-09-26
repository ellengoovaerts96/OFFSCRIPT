import { resolveUserIdentity } from "./whatsappUsersRepository.js";
import { pool } from "../integrations/postgres.js";
import type { UserContext } from "../types/userContext.js";
import { emptyFeedbackAspects, type FeedbackAspects } from "../logic/recommendationFeedback.js";
import type { RecommendationFeedbackRating, RecommendationFeedbackReason } from "../logic/recommendationFeedback.js";

export type PendingRecommendationFeedback = {
  id: string;
  rating: RecommendationFeedbackRating;
  reason?: RecommendationFeedbackReason;
  awaitingPositiveDetail: boolean;
  placeId: string | null;
  placeName: string;
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
  aspects?: FeedbackAspects;
}): Promise<void> {
  const { userId } = await resolveUserIdentity(input.userPhone);
  await pool.query(
    `INSERT INTO public.recommendation_feedback (
       user_phone, place_id, place_name, rating, traveller_type, requested_vibe,
       context_snapshot, acquisition_source_id, free_text, awaiting_positive_detail, reason, user_id, awaiting_detail, conversation_closed, aspects
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)`,
    [input.userPhone, input.placeId, input.placeName, input.rating,
      input.context.travellerType ?? null, input.context.vibe ?? input.context.requestedStyle ?? null,
      JSON.stringify(input.context), input.acquisitionSourceId ?? null, input.freeText ?? null,
      input.rating === "loved" && !input.complete, input.reason ?? null, userId,
      input.rating !== "did_not_go" && !input.complete, Boolean(input.complete || input.rating === "did_not_go"), JSON.stringify(input.aspects ?? emptyFeedbackAspects())]
  );
}

export async function getPendingRecommendationFeedback(userPhone: string): Promise<PendingRecommendationFeedback | null> {
  const result = await pool.query<{
    id: string;
    rating: RecommendationFeedbackRating;
    reason: RecommendationFeedbackReason | null;
    awaiting_positive_detail: boolean;
    place_id: string | null;
    place_name: string;
  }>(
    `SELECT id, rating, reason, awaiting_positive_detail, place_id, place_name FROM public.recommendation_feedback
     WHERE user_phone = $1 AND conversation_closed = false AND awaiting_detail = true
     ORDER BY created_at DESC LIMIT 1`,
    [userPhone]
  );
  const row = result.rows[0];
  return row ? {
    id: row.id,
    rating: row.rating,
    reason: row.reason ?? undefined,
    awaitingPositiveDetail: row.awaiting_positive_detail,
    placeId: row.place_id,
    placeName: row.place_name
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
    "UPDATE public.recommendation_feedback SET conversation_closed = true, awaiting_detail = false, awaiting_positive_detail = false, updated_at = NOW() WHERE user_phone = $1 AND conversation_closed = false",
    [userPhone]
  );
}

/** Finish the one requested follow-up on the existing rating, preserving the original review. */
export async function completeRecommendationFeedback(id: string, detail: string, aspects?: FeedbackAspects): Promise<void> {
  await pool.query(`UPDATE public.recommendation_feedback
    SET free_text = concat_ws(E'\\n', NULLIF(free_text, ''), NULLIF($2::text, '')),
        positive_detail = CASE WHEN rating = 'loved' THEN NULLIF($2::text, '') ELSE positive_detail END,
        aspects = COALESCE($3::jsonb, aspects), awaiting_detail = false,
        awaiting_positive_detail = false, conversation_closed = true, updated_at = NOW()
    WHERE id = $1 AND conversation_closed = false`, [id, detail, aspects ? JSON.stringify(aspects) : null]);
}
