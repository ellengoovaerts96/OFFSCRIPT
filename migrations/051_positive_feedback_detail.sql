ALTER TABLE public.recommendation_feedback
  ADD COLUMN IF NOT EXISTS positive_detail TEXT,
  ADD COLUMN IF NOT EXISTS awaiting_positive_detail BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS recommendation_feedback_pending_positive_idx
  ON public.recommendation_feedback(user_phone, created_at DESC)
  WHERE awaiting_positive_detail = true;
