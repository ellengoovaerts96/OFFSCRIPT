ALTER TABLE public.conversation_context
  ADD COLUMN IF NOT EXISTS requested_subcategory TEXT;

COMMENT ON COLUMN public.conversation_context.requested_subcategory IS
  'A requested place subtype or hard selection criterion, kept separate from atmosphere/vibe.';
