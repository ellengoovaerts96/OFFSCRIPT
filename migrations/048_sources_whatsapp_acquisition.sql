CREATE TABLE IF NOT EXISTS public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL,
  name TEXT NOT NULL,
  home_neighbourhood TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sources_active_idx
  ON public.sources(active);

CREATE UNIQUE INDEX IF NOT EXISTS sources_code_lower_unique_idx
  ON public.sources(lower(code));

CREATE UNIQUE INDEX IF NOT EXISTS sources_slug_lower_unique_idx
  ON public.sources(lower(slug));

CREATE TABLE IF NOT EXISTS public.whatsapp_users (
  user_phone TEXT PRIMARY KEY,
  acquisition_source_id UUID REFERENCES public.sources(id),
  acquired_at TIMESTAMPTZ,
  home_neighbourhood TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_users_acquisition_source_id_idx
  ON public.whatsapp_users(acquisition_source_id);

CREATE TABLE IF NOT EXISTS public.processed_twilio_messages (
  message_sid TEXT PRIMARY KEY,
  user_phone TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS processed_twilio_messages_received_at_idx
  ON public.processed_twilio_messages(received_at);
