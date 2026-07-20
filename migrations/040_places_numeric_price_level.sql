ALTER TABLE public.places
  ALTER COLUMN price_level TYPE SMALLINT
  USING CASE
    WHEN price_level IS NULL OR btrim(price_level::text) = '' THEN NULL
    WHEN lower(btrim(price_level::text)) IN ('1', 'budget', 'low', '€', '$') THEN 1
    WHEN lower(btrim(price_level::text)) IN ('2', 'affordable', 'betaalbaar', '€€', '$$') THEN 2
    WHEN lower(btrim(price_level::text)) IN ('3', 'average', 'medium', 'mid-range', 'gemiddeld') THEN 3
    WHEN lower(btrim(price_level::text)) IN ('4', 'chic', 'high', 'upscale', '€€€', '$$$') THEN 4
    WHEN lower(btrim(price_level::text)) IN ('5', 'luxury', 'luxe', '€€€€', '$$$$') THEN 5
    ELSE NULL
  END;

ALTER TABLE public.places
  DROP CONSTRAINT IF EXISTS places_price_level_check;

ALTER TABLE public.places
  ADD CONSTRAINT places_price_level_check
  CHECK (price_level IS NULL OR price_level BETWEEN 1 AND 5);
