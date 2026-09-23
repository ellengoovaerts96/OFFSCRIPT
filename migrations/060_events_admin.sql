CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES public.places(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  event_date DATE,
  details JSONB NOT NULL CHECK (jsonb_typeof(details) = 'object'),
  source JSONB,
  extraction JSONB,
  import_id UUID UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS events_place_id_idx ON public.events(place_id);
CREATE INDEX IF NOT EXISTS events_event_date_idx ON public.events(event_date);
