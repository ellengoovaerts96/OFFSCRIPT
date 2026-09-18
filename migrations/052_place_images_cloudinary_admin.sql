ALTER TABLE public.place_images
  ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT,
  ADD COLUMN IF NOT EXISTS original_filename TEXT,
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER,
  ADD COLUMN IF NOT EXISTS source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'place_images_source_allowed'
      AND conrelid = 'public.place_images'::regclass
  ) THEN
    ALTER TABLE public.place_images
      ADD CONSTRAINT place_images_source_allowed
      CHECK (source IS NULL OR source IN ('field_research', 'dashboard'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'place_images_dimensions_positive'
      AND conrelid = 'public.place_images'::regclass
  ) THEN
    ALTER TABLE public.place_images
      ADD CONSTRAINT place_images_dimensions_positive
      CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0));
  END IF;
END $$;

-- Editorial selection controls how many photos TUUTI sends to a traveller.
-- Storage itself is intentionally not limited to three images per place.
DROP TRIGGER IF EXISTS max_three_place_images ON public.place_images;
