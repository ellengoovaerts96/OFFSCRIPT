DO $$
BEGIN
  IF to_regclass('public.field_research_raw') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'field_research_raw'
        AND column_name = 'why_hidden_gem'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'field_research_raw'
        AND column_name = 'transport'
    )
  THEN
    ALTER TABLE field_research_raw RENAME COLUMN why_hidden_gem TO transport;
  END IF;
END $$;
