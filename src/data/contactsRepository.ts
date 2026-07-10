import { pool } from "../integrations/postgres.js";
import type { Contact } from "../types/contact.js";

type ContactRow = {
  id: string;
  name: string | null;
  role: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  languages: string[] | null;
  region: string | null;
  trusted: boolean;
  last_verified_at: Date | null;
};

type PlaceContactRow = {
  contact_name: string | null;
  contact_role: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  method_type: string | null;
  method_value: string | null;
};

type PlaceLegacyContactRow = {
  reservation_contact_name: string | null;
  reservation_phone: string | null;
  reservation_url: string | null;
};

export type PlaceContactDetail = {
  type: string;
  value: string;
  name?: string;
  role?: string;
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
    name: row.name ?? undefined,
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

function addContactDetail(
  details: PlaceContactDetail[],
  seen: Set<string>,
  detail: PlaceContactDetail | undefined
): void {
  if (!detail?.value.trim()) return;

  const normalizedKey = `${detail.type}:${detail.value.trim().toLowerCase()}`;
  if (seen.has(normalizedKey)) return;

  seen.add(normalizedKey);
  details.push({ ...detail, value: detail.value.trim() });
}

export async function listPlaceContactDetails(placeId: string): Promise<PlaceContactDetail[]> {
  const details: PlaceContactDetail[] = [];
  const seen = new Set<string>();

  const linkedContacts = await pool.query<PlaceContactRow>(
    `
      SELECT
        c.name AS contact_name,
        c.role AS contact_role,
        c.phone,
        c.whatsapp,
        c.email,
        cm.type AS method_type,
        cm.value AS method_value
      FROM place_contacts pc
      JOIN contacts c ON c.id = pc.contact_id
      LEFT JOIN contact_methods cm ON cm.contact_id = c.id
      WHERE pc.place_id = $1
      ORDER BY pc.created_at ASC, c.name ASC NULLS LAST, cm.created_at ASC
    `,
    [placeId]
  );

  for (const row of linkedContacts.rows) {
    const owner = {
      name: row.contact_name ?? undefined,
      role: row.contact_role ?? undefined
    };

    addContactDetail(details, seen, row.method_type && row.method_value
      ? { ...owner, type: row.method_type, value: row.method_value }
      : undefined);
    addContactDetail(details, seen, row.phone ? { ...owner, type: "phone", value: row.phone } : undefined);
    addContactDetail(details, seen, row.whatsapp ? { ...owner, type: "whatsapp", value: row.whatsapp } : undefined);
    addContactDetail(details, seen, row.email ? { ...owner, type: "email", value: row.email } : undefined);
  }

  const legacyContact = await pool.query<PlaceLegacyContactRow>(
    `
      SELECT reservation_contact_name, reservation_phone, reservation_url
      FROM places
      WHERE id = $1
      LIMIT 1
    `,
    [placeId]
  );

  const row = legacyContact.rows[0];
  if (row) {
    const owner = { name: row.reservation_contact_name ?? undefined };
    addContactDetail(details, seen, row.reservation_phone ? { ...owner, type: "phone", value: row.reservation_phone } : undefined);
    addContactDetail(details, seen, row.reservation_url ? { ...owner, type: "website", value: row.reservation_url } : undefined);
  }

  return details;
}
