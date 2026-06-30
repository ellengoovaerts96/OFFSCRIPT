CREATE TABLE IF NOT EXISTS field_research_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_at TIMESTAMP DEFAULT NOW(),

  entry_type TEXT,
  name TEXT,
  region TEXT,
  neighbourhood TEXT,
  google_maps_url TEXT,
  category TEXT,
  why_special TEXT,
  personal_tip TEXT,
  best_time TEXT,
  good_for TEXT,
  child_friendly TEXT,
  reservation_needed TEXT,
  contact_person TEXT,
  phone TEXT,
  transport_notes TEXT,
  traveller_notes TEXT,
  price_indication TEXT,
  google_photos_album TEXT,
  hero_photo_filename TEXT,
  story_notes TEXT,
  experience_potential TEXT,
  raw_google_sheet_row JSONB,

  status TEXT DEFAULT 'new'
);
