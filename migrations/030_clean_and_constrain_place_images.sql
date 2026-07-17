DO $$
BEGIN
  IF to_regclass('public.place_images') IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('public.place_images_place_url_unique') IS NULL THEN
    -- Keep the best record for an identical URL on the same place. Hero images
    -- and records with richer metadata win; age is the final stable tiebreaker.
    WITH ranked_duplicates AS (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY place_id, url
        ORDER BY
          is_hero_image DESC,
          ((alt_text IS NOT NULL)::int
            + (caption IS NOT NULL)::int
            + (photographer IS NOT NULL)::int) DESC,
          created_at ASC,
          id ASC
      ) AS duplicate_rank
    FROM public.place_images
  )
    DELETE FROM public.place_images AS image
    USING ranked_duplicates AS duplicate
    WHERE image.id = duplicate.id
      AND duplicate.duplicate_rank > 1;

    -- Give every image a deterministic, unique display position per place.
    WITH ordered_images AS (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY place_id
        ORDER BY
          is_hero_image DESC,
          sort_order ASC NULLS LAST,
          created_at ASC,
          id ASC
      ) - 1 AS normalized_sort_order
    FROM public.place_images
  )
    UPDATE public.place_images AS image
    SET sort_order = ordered.normalized_sort_order
    FROM ordered_images AS ordered
    WHERE image.id = ordered.id
      AND image.sort_order IS DISTINCT FROM ordered.normalized_sort_order;
  END IF;

  ALTER TABLE public.place_images
    ALTER COLUMN place_id SET NOT NULL,
    ALTER COLUMN sort_order SET DEFAULT 0,
    ALTER COLUMN sort_order SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'place_images_url_not_blank'
      AND conrelid = 'public.place_images'::regclass
  ) THEN
    ALTER TABLE public.place_images
      ADD CONSTRAINT place_images_url_not_blank CHECK (btrim(url) <> '');
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS place_images_place_url_unique
    ON public.place_images (place_id, url);

  CREATE UNIQUE INDEX IF NOT EXISTS place_images_place_sort_order_unique
    ON public.place_images (place_id, sort_order);

  CREATE UNIQUE INDEX IF NOT EXISTS place_images_one_hero_per_place
    ON public.place_images (place_id)
    WHERE is_hero_image;
END $$;
