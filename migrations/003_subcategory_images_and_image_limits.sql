CREATE TABLE IF NOT EXISTS place_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(place_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS places_name_unique_idx ON places(name);

CREATE TABLE IF NOT EXISTS place_subcategory_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_subcategory_id UUID NOT NULL REFERENCES place_subcategories(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  photographer TEXT,
  copyright_status TEXT,
  usage_allowed BOOLEAN DEFAULT false,
  is_hero_image BOOLEAN DEFAULT false,
  caption TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO place_subcategories (place_id, name, display_order)
SELECT p.id, subcategory_name, subcategory_order
FROM places p
CROSS JOIN LATERAL unnest(p.subcategories) WITH ORDINALITY AS subcategories(subcategory_name, subcategory_order)
WHERE subcategory_name IS NOT NULL
ON CONFLICT (place_id, name) DO NOTHING;

CREATE INDEX IF NOT EXISTS place_subcategories_place_id_idx ON place_subcategories(place_id);
CREATE INDEX IF NOT EXISTS place_subcategory_images_subcategory_id_idx
  ON place_subcategory_images(place_subcategory_id);

CREATE OR REPLACE FUNCTION enforce_max_three_place_images()
RETURNS TRIGGER AS $$
DECLARE
  image_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO image_count
  FROM place_images
  WHERE place_id = NEW.place_id
    AND id IS DISTINCT FROM NEW.id;

  IF image_count >= 3 THEN
    RAISE EXCEPTION 'A place can have at most 3 images';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS max_three_place_images ON place_images;

CREATE TRIGGER max_three_place_images
BEFORE INSERT OR UPDATE OF place_id ON place_images
FOR EACH ROW
EXECUTE FUNCTION enforce_max_three_place_images();

CREATE OR REPLACE FUNCTION enforce_max_three_subcategory_images()
RETURNS TRIGGER AS $$
DECLARE
  image_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO image_count
  FROM place_subcategory_images
  WHERE place_subcategory_id = NEW.place_subcategory_id
    AND id IS DISTINCT FROM NEW.id;

  IF image_count >= 3 THEN
    RAISE EXCEPTION 'A place subcategory can have at most 3 images';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS max_three_subcategory_images ON place_subcategory_images;

CREATE TRIGGER max_three_subcategory_images
BEFORE INSERT OR UPDATE OF place_subcategory_id ON place_subcategory_images
FOR EACH ROW
EXECUTE FUNCTION enforce_max_three_subcategory_images();
