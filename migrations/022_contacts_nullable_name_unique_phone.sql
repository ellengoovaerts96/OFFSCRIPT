ALTER TABLE contacts
  ALTER COLUMN name DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_phone_unique_idx
  ON contacts(phone)
  WHERE phone IS NOT NULL
    AND btrim(phone) <> '';
