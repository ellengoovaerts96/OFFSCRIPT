DO $$
BEGIN
  IF to_regclass('public.field_research_raw') IS NOT NULL THEN
    ALTER TABLE field_research_raw
      ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT false;

    UPDATE field_research_raw
    SET processed = false
    WHERE processed IS NULL;
  END IF;
END $$;
