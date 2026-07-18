ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS source_row_id TEXT;

WITH unique_raw_names AS (
  SELECT lower(btrim(place)) AS normalized_name, min(source_row_id) AS source_row_id
  FROM public.field_research_raw
  WHERE source_row_id IS NOT NULL
    AND NULLIF(btrim(place), '') IS NOT NULL
    AND lower(COALESCE(entry_type, 'place')) LIKE '%place%'
  GROUP BY lower(btrim(place))
  HAVING count(*) = 1
), unique_place_names AS (
  SELECT lower(btrim(name)) AS normalized_name, (array_agg(id))[1] AS place_id
  FROM public.places
  GROUP BY lower(btrim(name))
  HAVING count(*) = 1
)
UPDATE public.places AS place
SET source_row_id = raw.source_row_id
FROM unique_raw_names AS raw
JOIN unique_place_names AS existing USING (normalized_name)
WHERE place.id = existing.place_id
  AND place.source_row_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS places_source_row_id_unique
  ON public.places (source_row_id)
  WHERE source_row_id IS NOT NULL;
