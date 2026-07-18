ALTER TABLE public.field_research_raw
  ADD COLUMN IF NOT EXISTS area_en TEXT,
  ADD COLUMN IF NOT EXISTS area_fr TEXT;

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS area_en TEXT,
  ADD COLUMN IF NOT EXISTS area_fr TEXT;

UPDATE public.field_research_raw
SET area_en = area
WHERE area_en IS NULL
  AND area IS NOT NULL;

UPDATE public.places
SET
  area = COALESCE(area, exact_area),
  area_en = COALESCE(area_en, area, exact_area)
WHERE area IS NOT NULL
   OR exact_area IS NOT NULL;

ALTER TABLE public.places
  DROP COLUMN IF EXISTS exact_area;

