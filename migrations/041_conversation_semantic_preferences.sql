ALTER TABLE public.conversation_context
  ADD COLUMN IF NOT EXISTS excluded_categories TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS excluded_subcategories TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dietary_exclusions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS avoid_audience_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS maximum_price_level SMALLINT,
  ADD COLUMN IF NOT EXISTS alcohol_allowed BOOLEAN;

ALTER TABLE public.conversation_context
  DROP CONSTRAINT IF EXISTS conversation_context_maximum_price_level_check;

ALTER TABLE public.conversation_context
  ADD CONSTRAINT conversation_context_maximum_price_level_check
  CHECK (maximum_price_level IS NULL OR maximum_price_level BETWEEN 1 AND 5);
