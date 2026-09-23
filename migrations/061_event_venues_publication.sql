CREATE TABLE IF NOT EXISTS public.event_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  neighbourhood TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  google_maps_url TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_venue_id UUID REFERENCES public.event_venues(id) ON DELETE SET NULL;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_status_check CHECK (status IN ('draft', 'published'));
CREATE INDEX IF NOT EXISTS events_event_venue_id_idx ON public.events(event_venue_id);
