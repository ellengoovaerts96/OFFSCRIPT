ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS editorial_locked_fields TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS editorial_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS editorial_updated_by TEXT,
  ADD COLUMN IF NOT EXISTS status_before_archive TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS places_archived_at_idx ON public.places(archived_at);
CREATE INDEX IF NOT EXISTS places_editorial_locked_fields_idx
  ON public.places USING GIN(editorial_locked_fields);
