DO $$
BEGIN
  IF to_regclass('public.field_research_raw') IS NOT NULL THEN
    ALTER TABLE field_research_raw
      ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMPTZ;

    CREATE UNIQUE INDEX IF NOT EXISTS field_research_raw_timestamp_key
      ON field_research_raw ("timestamp");
  END IF;
END $$;
