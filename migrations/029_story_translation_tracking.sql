ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS translation_source_hash TEXT,
  ADD COLUMN IF NOT EXISTS translation_status TEXT,
  ADD COLUMN IF NOT EXISTS translation_updated_at TIMESTAMPTZ;

UPDATE public.stories AS story
SET translation_status = 'manual'
WHERE story.translation_status IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.story_translations AS translation
    WHERE translation.story_id = story.id
      AND translation.locale = 'fr'
  );
