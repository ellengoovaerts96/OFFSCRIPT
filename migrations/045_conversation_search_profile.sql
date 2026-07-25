ALTER TABLE conversation_context
ADD COLUMN IF NOT EXISTS search_profile JSONB;
