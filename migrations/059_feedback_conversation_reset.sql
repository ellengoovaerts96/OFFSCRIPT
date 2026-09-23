ALTER TABLE public.recommendation_feedback
ADD COLUMN IF NOT EXISTS conversation_closed BOOLEAN NOT NULL DEFAULT false;
