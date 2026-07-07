DO $$
DECLARE
  story_column RECORD;
BEGIN
  IF to_regclass('public.field_research_raw') IS NOT NULL THEN
    ALTER TABLE field_research_raw
      ADD COLUMN IF NOT EXISTS entry_type TEXT DEFAULT 'place';

    ALTER TABLE field_research_raw
      ALTER COLUMN entry_type SET DEFAULT 'place';

    UPDATE field_research_raw
    SET entry_type = 'place';

    FOR story_column IN
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'field_research_raw'
        AND column_name ILIKE '%story%'
    LOOP
      EXECUTE format(
        $sql$
          UPDATE field_research_raw
          SET entry_type = 'place, story'
          WHERE %1$I IS NOT NULL
            AND btrim(%1$I::text) <> ''
            AND lower(btrim(%1$I::text)) NOT IN ('-', 'n/a', 'na', 'none', 'null', 'geen', 'no')
        $sql$,
        story_column.column_name
      );
    END LOOP;
  END IF;
END $$;
