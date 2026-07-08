ALTER TABLE place_images
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

CREATE OR REPLACE FUNCTION public.enforce_max_three_place_images()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  image_count INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM place_images
    WHERE place_id = NEW.place_id
      AND sort_order = NEW.sort_order
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO image_count
  FROM place_images
  WHERE place_id = NEW.place_id;

  IF image_count >= 3 THEN
    RAISE EXCEPTION 'A place can have at most 3 images';
  END IF;

  RETURN NEW;
END;
$function$;
