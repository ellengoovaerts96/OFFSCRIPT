CREATE TABLE IF NOT EXISTS public.recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL,
  place_id UUID REFERENCES public.places(id) ON DELETE SET NULL,
  place_name TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('loved', 'okay', 'disliked', 'did_not_go')),
  reason TEXT CHECK (reason IN ('too_touristy', 'too_expensive', 'wrong_vibe', 'too_far', 'food_drinks', 'something_else')),
  free_text TEXT,
  traveller_type TEXT,
  requested_vibe TEXT,
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  acquisition_source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recommendation_feedback_place_id_idx
  ON public.recommendation_feedback(place_id, created_at DESC);

CREATE INDEX IF NOT EXISTS recommendation_feedback_user_phone_idx
  ON public.recommendation_feedback(user_phone, created_at DESC);
