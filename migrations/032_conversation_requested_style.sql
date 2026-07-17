ALTER TABLE public.conversation_context
  ADD COLUMN IF NOT EXISTS requested_style TEXT;

COMMENT ON COLUMN public.conversation_context.requested_style IS
  'Requested local or international style, stored separately from atmosphere and budget.';
