ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS offscript_pick_level SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offscript_priority SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offscript_reason_nl TEXT,
  ADD COLUMN IF NOT EXISTS offscript_reason_en TEXT,
  ADD COLUMN IF NOT EXISTS offscript_reason_fr TEXT,
  ADD COLUMN IF NOT EXISTS authenticity SMALLINT,
  ADD COLUMN IF NOT EXISTS local_vs_western SMALLINT,
  ADD COLUMN IF NOT EXISTS occasion_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS quick_meal BOOLEAN,
  ADD COLUMN IF NOT EXISTS work_friendly BOOLEAN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_offscript_pick_level_check') THEN
    ALTER TABLE public.places
      ADD CONSTRAINT places_offscript_pick_level_check
      CHECK (offscript_pick_level BETWEEN 0 AND 3);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_offscript_priority_check') THEN
    ALTER TABLE public.places
      ADD CONSTRAINT places_offscript_priority_check
      CHECK (offscript_priority BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_authenticity_check') THEN
    ALTER TABLE public.places
      ADD CONSTRAINT places_authenticity_check
      CHECK (authenticity IS NULL OR authenticity BETWEEN 0 AND 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_local_vs_western_check') THEN
    ALTER TABLE public.places
      ADD CONSTRAINT places_local_vs_western_check
      CHECK (local_vs_western IS NULL OR local_vs_western BETWEEN -2 AND 2);
  END IF;
END
$$;

