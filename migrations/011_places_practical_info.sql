DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'places'
      AND column_name = 'long_description'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'places'
      AND column_name = 'practical_info'
  ) THEN
    ALTER TABLE places RENAME COLUMN long_description TO practical_info;
  END IF;
END $$;
