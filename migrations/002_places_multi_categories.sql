ALTER TABLE places
  ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS subcategories TEXT[] DEFAULT '{}';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'places'
      AND column_name = 'category'
  ) THEN
    EXECUTE '
      UPDATE places
      SET categories = ARRAY[category]
      WHERE cardinality(categories) = 0
        AND category IS NOT NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'places'
      AND column_name = 'subcategory'
  ) THEN
    EXECUTE '
      UPDATE places
      SET subcategories = ARRAY[subcategory]
      WHERE (subcategories IS NULL OR cardinality(subcategories) = 0)
        AND subcategory IS NOT NULL
    ';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS places_categories_idx ON places USING GIN(categories);

DROP INDEX IF EXISTS places_category_idx;

ALTER TABLE places
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS subcategory;
