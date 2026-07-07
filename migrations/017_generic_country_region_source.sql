DO $$
BEGIN
  IF to_regclass('public.places') IS NOT NULL THEN
    UPDATE places
    SET country = 'Senegal'
    WHERE country IS NULL
      OR btrim(country) = '';

    ALTER TABLE places
      ALTER COLUMN country DROP DEFAULT;
  END IF;

  IF to_regclass('public.field_research_raw') IS NOT NULL THEN
    ALTER TABLE field_research_raw
      ADD COLUMN IF NOT EXISTS country TEXT,
      ADD COLUMN IF NOT EXISTS region TEXT;
  END IF;
END $$;
