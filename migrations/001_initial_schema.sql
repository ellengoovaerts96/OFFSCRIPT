CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT DEFAULT 'Senegal',
  region TEXT NOT NULL,
  neighbourhood TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  short_description TEXT NOT NULL,
  long_description TEXT,
  personal_tip TEXT,
  why_hidden_gem TEXT,
  best_for TEXT[],
  not_ideal_for TEXT[],
  traveller_types TEXT[],
  child_friendly BOOLEAN DEFAULT false,
  child_notes TEXT,
  best_timing TEXT[],
  opening_hours TEXT,
  closed_days TEXT[],
  price_level TEXT,
  payment_notes TEXT,
  reservation_needed BOOLEAN DEFAULT false,
  reservation_method TEXT,
  reservation_contact_name TEXT,
  reservation_phone TEXT,
  reservation_url TEXT,
  google_maps_url TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  transport_notes TEXT,
  taxi_notes TEXT,
  parking_notes TEXT,
  safety_notes TEXT,
  guide_available BOOLEAN DEFAULT false,
  guide_name TEXT,
  guide_phone TEXT,
  guide_languages TEXT[],
  source TEXT,
  verified_by TEXT,
  last_verified_at DATE,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS place_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  photographer TEXT,
  copyright_status TEXT,
  usage_allowed BOOLEAN DEFAULT false,
  is_hero_image BOOLEAN DEFAULT false,
  caption TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  languages TEXT[],
  region TEXT,
  notes TEXT,
  trusted BOOLEAN DEFAULT false,
  last_verified_at DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id),
  user_name TEXT,
  reservation_date DATE,
  reservation_time TIME,
  number_of_people INTEGER,
  children BOOLEAN DEFAULT false,
  phone TEXT,
  language TEXT,
  notes TEXT,
  status TEXT DEFAULT 'requested',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL UNIQUE,
  language TEXT,
  current_location TEXT,
  target_region TEXT,
  traveller_type TEXT,
  has_children BOOLEAN,
  children_ages TEXT,
  intent TEXT,
  timing TEXT,
  budget TEXT,
  vibe TEXT,
  safety_concern BOOLEAN,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS places_region_idx ON places(region);
CREATE INDEX IF NOT EXISTS places_neighbourhood_idx ON places(neighbourhood);
CREATE INDEX IF NOT EXISTS places_category_idx ON places(category);
CREATE INDEX IF NOT EXISTS places_status_idx ON places(status);
CREATE INDEX IF NOT EXISTS conversation_context_user_phone_idx ON conversation_context(user_phone);
