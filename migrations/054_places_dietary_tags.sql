ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS dietary_tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS places_dietary_tags_idx
  ON public.places USING GIN (dietary_tags);

COMMENT ON COLUMN public.places.dietary_tags IS
  'Confirmed dietary options such as halal, vegetarian_options and vegan_options.';
