DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'places'
      AND column_name = 'why_hidden_gem'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'places'
      AND column_name = 'transport'
  ) THEN
    ALTER TABLE places RENAME COLUMN why_hidden_gem TO transport;
  END IF;
END $$;
