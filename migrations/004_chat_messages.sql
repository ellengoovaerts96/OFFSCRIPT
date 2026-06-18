CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_messages_user_phone_created_at_idx
  ON chat_messages(user_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx
  ON chat_messages(created_at DESC);
