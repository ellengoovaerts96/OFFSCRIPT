DO $$
BEGIN
  IF to_regclass('public.field_research_raw') IS NOT NULL THEN
    ALTER TABLE field_research_raw
      ALTER COLUMN "timestamp" DROP DEFAULT,
      ALTER COLUMN "timestamp" DROP NOT NULL;

    -- Values are supplied by Google Sheets via n8n. NULL remains allowed for
    -- legacy rows until the next source_row_id-based synchronization.
  END IF;
END $$;
