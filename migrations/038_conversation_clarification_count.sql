ALTER TABLE conversation_context
  ADD COLUMN IF NOT EXISTS clarification_count SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN conversation_context.clarification_count IS
  'Number of recommendation clarification questions asked since the last conversation reset.';
