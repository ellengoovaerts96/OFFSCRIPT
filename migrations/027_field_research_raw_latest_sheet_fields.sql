DO $$
BEGIN
  IF to_regclass('public.field_research_raw') IS NOT NULL THEN
    ALTER TABLE public.field_research_raw
      ADD COLUMN IF NOT EXISTS food_orientation TEXT,
      ADD COLUMN IF NOT EXISTS paid_experience_later TEXT,
      ADD COLUMN IF NOT EXISTS experience_idea TEXT,
      ADD COLUMN IF NOT EXISTS update_notes TEXT;
  END IF;
END $$;
