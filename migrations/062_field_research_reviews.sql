CREATE TABLE IF NOT EXISTS public.field_research_inbox (
  id BIGSERIAL PRIMARY KEY,
  source_key TEXT NOT NULL UNIQUE,
  source_row_id TEXT,
  source_type TEXT NOT NULL,
  raw JSONB NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  processing_error TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.field_research_inbox ADD COLUMN IF NOT EXISTS retry_after TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS public.field_research_sync_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  last_attempt TIMESTAMPTZ,
  last_success TIMESTAMPTZ,
  error TEXT
);
-- Editorial overlay only. The Google Sheet raw table is never updated here.
CREATE TABLE IF NOT EXISTS public.field_research_reviews (
  source_key TEXT PRIMARY KEY,
  raw_id BIGINT NOT NULL,
  source_row_id TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_review','approved','rejected','archived')),
  reviewed JSONB NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(reviewed)='object'),
  raw_snapshot JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  approved_place_id UUID REFERENCES public.places(id) ON DELETE SET NULL,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.field_research_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL REFERENCES public.field_research_reviews(source_key),
  source_row_id TEXT,
  raw_id BIGINT NOT NULL,
  place_id UUID REFERENCES public.places(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK(action IN ('create','update')),
  raw_snapshot JSONB NOT NULL,
  reviewed_snapshot JSONB NOT NULL,
  changes JSONB NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS field_research_reviews_status_idx ON public.field_research_reviews(status);
