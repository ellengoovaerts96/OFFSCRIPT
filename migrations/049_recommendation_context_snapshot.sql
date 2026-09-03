ALTER TABLE place_recommendation_history
  ADD COLUMN IF NOT EXISTS context_snapshot JSONB;

COMMENT ON COLUMN place_recommendation_history.context_snapshot IS
  'The accumulated traveller needs at the moment this place was selected, used to ground later follow-ups.';
