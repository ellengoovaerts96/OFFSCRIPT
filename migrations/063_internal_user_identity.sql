-- Phase 2C.1: additive, exact legacy-key mapping. Never repair unknown identities here.
-- Atomic and bounded: a busy/large database must fail safely instead of holding long locks.
-- Add the volatile UUID default AFTER the nullable column to avoid a table rewrite.
BEGIN;
SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.whatsapp_users ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.whatsapp_users ALTER COLUMN user_id SET DEFAULT gen_random_uuid();
UPDATE public.whatsapp_users SET user_id = gen_random_uuid() WHERE user_id IS NULL;
ALTER TABLE public.whatsapp_users ALTER COLUMN user_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_users_user_id_key ON public.whatsapp_users(user_id);
-- The pair additionally prevents a valid UUID being attached to the WRONG legacy identity.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_users_phone_user_id_key ON public.whatsapp_users(user_phone, user_id);

DO $migration$
DECLARE
  table_name text;
  fk_name text;
  invalid_count bigint;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'conversation_context', 'chat_messages', 'place_recommendation_history',
    'recommendation_feedback', 'processed_twilio_messages'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS user_id uuid', table_name);
    -- The deployment runner replays migrations: backfill NULLs only, never replace an ID.
    EXECUTE format('UPDATE public.%I d SET user_id = u.user_id FROM public.whatsapp_users u
      WHERE d.user_phone = u.user_phone AND d.user_id IS NULL', table_name);
    EXECUTE format('SELECT count(*) FROM public.%I d LEFT JOIN public.whatsapp_users u ON u.user_phone = d.user_phone
      WHERE (d.user_phone IS NOT NULL AND (u.user_id IS NULL OR d.user_id IS DISTINCT FROM u.user_id))
         OR (d.user_phone IS NULL AND d.user_id IS NOT NULL)', table_name) INTO invalid_count;
    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Identity migration stopped: % unresolved or mismatched relationships in %', invalid_count, table_name;
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(user_id)', table_name || '_user_id_idx', table_name);
    fk_name := table_name || '_user_id_fk';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', table_name)::regclass AND conname = fk_name) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(user_id)
        REFERENCES public.whatsapp_users(user_id) ON DELETE RESTRICT NOT VALID', table_name, fk_name);
    END IF;
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', table_name, fk_name);
    fk_name := table_name || '_identity_pair_fk';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', table_name)::regclass AND conname = fk_name) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(user_phone, user_id)
        REFERENCES public.whatsapp_users(user_phone, user_id) ON DELETE RESTRICT NOT VALID', table_name, fk_name);
    END IF;
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', table_name, fk_name);
  END LOOP;
END
$migration$;
COMMIT;
