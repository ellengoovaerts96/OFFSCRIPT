CREATE TABLE IF NOT EXISTS experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  short_description TEXT,
  full_description TEXT,
  hero_image TEXT,
  duration TEXT,
  location TEXT,
  price NUMERIC,
  currency TEXT DEFAULT 'EUR',
  max_people INTEGER,
  child_friendly BOOLEAN DEFAULT false,
  included TEXT,
  excluded TEXT,
  meeting_point TEXT,
  reservation_required BOOLEAN DEFAULT true,
  whatsapp_prefill_text TEXT,
  featured BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS experiences_status_idx
  ON experiences(status);

CREATE INDEX IF NOT EXISTS experiences_featured_idx
  ON experiences(featured);

CREATE INDEX IF NOT EXISTS experiences_slug_idx
  ON experiences(slug);

CREATE TABLE IF NOT EXISTS experience_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id UUID NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  caption TEXT,
  is_hero BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS experience_images_experience_id_idx
  ON experience_images(experience_id);

CREATE TABLE IF NOT EXISTS experience_place_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id UUID NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  relation_type TEXT DEFAULT 'main',
  UNIQUE(experience_id, place_id)
);

CREATE TABLE IF NOT EXISTS experience_story_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id UUID NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  UNIQUE(experience_id, story_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stories_related_experience_id_fkey'
  ) THEN
    ALTER TABLE stories
      ADD CONSTRAINT stories_related_experience_id_fkey
      FOREIGN KEY (related_experience_id)
      REFERENCES experiences(id);
  END IF;
END $$;
