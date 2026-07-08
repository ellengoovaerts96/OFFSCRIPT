CREATE TABLE IF NOT EXISTS contact_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, type, value)
);

CREATE INDEX IF NOT EXISTS contact_methods_contact_id_idx
  ON contact_methods(contact_id);

CREATE TABLE IF NOT EXISTS place_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  role TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(place_id, contact_id)
);

CREATE INDEX IF NOT EXISTS place_contacts_place_id_idx
  ON place_contacts(place_id);

CREATE INDEX IF NOT EXISTS place_contacts_contact_id_idx
  ON place_contacts(contact_id);
