ALTER TABLE public.conversation_context
  ADD COLUMN IF NOT EXISTS feedback_invitation_shown BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feedback_accepted_place_id UUID;
