ALTER TABLE public.recommendation_feedback
  ADD COLUMN IF NOT EXISTS awaiting_detail BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aspects JSONB NOT NULL DEFAULT '{"food":"unknown","atmosphere":"unknown","service":"unknown","value":"unknown"}'::jsonb;

UPDATE public.recommendation_feedback
SET awaiting_detail = true
WHERE conversation_closed = false AND (
  awaiting_positive_detail = true OR
  (rating IN ('okay', 'disliked') AND (reason IS NULL OR (reason = 'something_else' AND free_text IS NULL)))
);

CREATE INDEX IF NOT EXISTS recommendation_feedback_pending_detail_idx
  ON public.recommendation_feedback(user_phone, created_at DESC)
  WHERE awaiting_detail = true AND conversation_closed = false;
