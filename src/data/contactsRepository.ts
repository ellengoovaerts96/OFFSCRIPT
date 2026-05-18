import { pool } from "../integrations/postgres.js";
import type { Contact } from "../types/contact.js";

type ContactRow = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  languages: string[] | null;
  region: string | null;
  trusted: boolean;
  last_verified_at: Date | null;
};

export async function listTrustedContacts(): Promise<Contact[]> {
  const result = await pool.query<ContactRow>(`
    SELECT id, name, role, phone, whatsapp, email, languages, region, trusted, last_verified_at
    FROM contacts
    WHERE trusted = true
    ORDER BY name ASC
  `);

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role ?? undefined,
    phone: row.phone ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    email: row.email ?? undefined,
    languages: row.languages ?? [],
    region: row.region ?? undefined,
    trusted: row.trusted,
    lastVerifiedAt: row.last_verified_at?.toISOString().slice(0, 10)
  }));
}
