CREATE TABLE IF NOT EXISTS place_recommendation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL,
  place_id UUID REFERENCES places(id) ON DELETE SET NULL,
  place_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_phone, place_id)
);

CREATE INDEX IF NOT EXISTS place_recommendation_history_user_phone_created_at_idx
  ON place_recommendation_history(user_phone, created_at DESC);
