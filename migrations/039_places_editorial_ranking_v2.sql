ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS food_orientation SMALLINT,
  ADD COLUMN IF NOT EXISTS audience_orientation SMALLINT,
  ADD COLUMN IF NOT EXISTS audience_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS adventure_level SMALLINT,
  ADD COLUMN IF NOT EXISTS editorial_review_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS editorial_verified_by TEXT,
  ADD COLUMN IF NOT EXISTS editorial_review_notes TEXT,
  ADD COLUMN IF NOT EXISTS editorial_verified_at TIMESTAMPTZ;

UPDATE public.places
SET audience_orientation = local_vs_western
WHERE audience_orientation IS NULL AND local_vs_western IS NOT NULL;

UPDATE public.places
SET occasion_tags = array_remove(occasion_tags, 'quick_meal');

ALTER TABLE public.places
  DROP CONSTRAINT IF EXISTS places_local_vs_western_check,
  DROP COLUMN IF EXISTS local_vs_western,
  DROP COLUMN IF EXISTS quick_meal;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_food_orientation_check') THEN
    ALTER TABLE public.places ADD CONSTRAINT places_food_orientation_check
      CHECK (food_orientation IS NULL OR food_orientation BETWEEN -2 AND 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_audience_orientation_check') THEN
    ALTER TABLE public.places ADD CONSTRAINT places_audience_orientation_check
      CHECK (audience_orientation IS NULL OR audience_orientation BETWEEN -2 AND 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_adventure_level_check') THEN
    ALTER TABLE public.places ADD CONSTRAINT places_adventure_level_check
      CHECK (adventure_level IS NULL OR adventure_level BETWEEN 0 AND 3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_editorial_review_status_check') THEN
    ALTER TABLE public.places ADD CONSTRAINT places_editorial_review_status_check
      CHECK (editorial_review_status IN ('draft', 'needs_review', 'approved'));
  END IF;
END
$$;
