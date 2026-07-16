DO $$
BEGIN
  IF to_regclass('public.field_research_raw') IS NOT NULL THEN
    ALTER TABLE public.field_research_raw
      ADD COLUMN IF NOT EXISTS short_description_en TEXT,
      ADD COLUMN IF NOT EXISTS short_description_fr TEXT,
      ADD COLUMN IF NOT EXISTS practical_info_en TEXT,
      ADD COLUMN IF NOT EXISTS practical_info_fr TEXT,
      ADD COLUMN IF NOT EXISTS personal_tip_en TEXT,
      ADD COLUMN IF NOT EXISTS personal_tip_fr TEXT,
      ADD COLUMN IF NOT EXISTS story_en TEXT,
      ADD COLUMN IF NOT EXISTS story_fr TEXT,
      ADD COLUMN IF NOT EXISTS translation_source_hash TEXT,
      ADD COLUMN IF NOT EXISTS translation_status TEXT,
      ADD COLUMN IF NOT EXISTS translation_updated_at TIMESTAMPTZ;

    UPDATE public.field_research_raw
    SET
      short_description_en = COALESCE(short_description_en, short_description),
      practical_info_en = COALESCE(practical_info_en, practical_info),
      personal_tip_en = COALESCE(personal_tip_en, personal_tip),
      story_en = COALESCE(story_en, story)
    WHERE short_description_en IS NULL
       OR practical_info_en IS NULL
       OR personal_tip_en IS NULL
       OR story_en IS NULL;
  END IF;

  IF to_regclass('public.places') IS NOT NULL THEN
    ALTER TABLE public.places
      ADD COLUMN IF NOT EXISTS short_description_en TEXT,
      ADD COLUMN IF NOT EXISTS short_description_fr TEXT,
      ADD COLUMN IF NOT EXISTS practical_info_en TEXT,
      ADD COLUMN IF NOT EXISTS practical_info_fr TEXT,
      ADD COLUMN IF NOT EXISTS personal_tip_en TEXT,
      ADD COLUMN IF NOT EXISTS personal_tip_fr TEXT,
      ADD COLUMN IF NOT EXISTS story_en TEXT,
      ADD COLUMN IF NOT EXISTS story_fr TEXT;

    UPDATE public.places
    SET
      short_description_en = COALESCE(short_description_en, short_description),
      practical_info_en = COALESCE(practical_info_en, practical_info),
      personal_tip_en = COALESCE(personal_tip_en, personal_tip)
    WHERE short_description_en IS NULL
       OR practical_info_en IS NULL
       OR personal_tip_en IS NULL;
  END IF;
END $$;
