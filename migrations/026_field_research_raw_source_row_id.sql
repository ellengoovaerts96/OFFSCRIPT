DO $$
BEGIN
  IF to_regclass('public.field_research_raw') IS NOT NULL THEN
    ALTER TABLE public.field_research_raw
      ADD COLUMN IF NOT EXISTS source_row_id TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS field_research_raw_source_row_id_unique
      ON public.field_research_raw (source_row_id);
  END IF;
END $$;
