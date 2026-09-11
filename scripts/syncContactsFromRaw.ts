import "dotenv/config";
import pg, { type PoolClient } from "pg";

const dryRun = process.argv.includes("--dry-run");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--dry-run");
const DATABASE_CONNECTION_TIMEOUT_MS = 15_000;

type RawContact = {
  source_row_id: string;
  place: string;
  region: string | null;
  contact_person: string | null;
  phone: string;
};

type PlaceRow = {
  id: string;
  source_row_id: string | null;
  name: string;
};

type ContactRow = {
  id: string;
  name: string | null;
  phone: string;
  whatsapp: string | null;
  region: string | null;
};

type ContactPlan = {
  key: string;
  name: string | null;
  phone: string;
  region: string | null;
  existing?: ContactRow;
};

type LinkPlan = {
  place: PlaceRow;
  contactKey: string;
};

function text(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizedName(value: string): string {
  return value.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizedPhone(value: string): string {
  return value.replace(/\D/g, "");
}

function mergePreferred(current: string | null, candidate: string | null): string | null {
  return current ?? candidate;
}

async function writePlans(
  client: PoolClient,
  contacts: ContactPlan[],
  links: LinkPlan[]
): Promise<{ insertedContacts: number; updatedContacts: number; insertedLinks: number }> {
  await client.query("BEGIN");
  const contactIds = new Map<string, string>();
  let insertedContacts = 0;
  let updatedContacts = 0;
  let insertedLinks = 0;

  try {
    for (const plan of contacts) {
      if (plan.existing) {
        const name = mergePreferred(plan.existing.name, plan.name);
        const whatsapp = mergePreferred(plan.existing.whatsapp, plan.phone);
        const region = mergePreferred(plan.existing.region, plan.region);
        const changed = name !== plan.existing.name
          || whatsapp !== plan.existing.whatsapp
          || region !== plan.existing.region;

        if (changed) {
          await client.query(
            `UPDATE public.contacts
             SET name = $1, whatsapp = $2, region = $3
             WHERE id = $4`,
            [name, whatsapp, region, plan.existing.id]
          );
          updatedContacts++;
        }
        contactIds.set(plan.key, plan.existing.id);
        continue;
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.contacts (name, phone, whatsapp, region, trusted)
         VALUES ($1, $2, $2, $3, false)
         RETURNING id`,
        [plan.name, plan.phone, plan.region]
      );
      contactIds.set(plan.key, inserted.rows[0]!.id);
      insertedContacts++;
    }

    for (const plan of links) {
      const contactId = contactIds.get(plan.contactKey);
      if (!contactId) throw new Error(`No contact id resolved for ${plan.contactKey}.`);
      const result = await client.query(
        `INSERT INTO public.place_contacts (place_id, contact_id)
         VALUES ($1, $2)
         ON CONFLICT (place_id, contact_id) DO NOTHING`,
        [plan.place.id, contactId]
      );
      insertedLinks += result.rowCount ?? 0;
    }

    await client.query("COMMIT");
    return { insertedContacts, updatedContacts, insertedLinks };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main(): Promise<void> {
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}. Supported: --dry-run`);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is missing.");
  console.log(`Contact sync starting in ${dryRun ? "read-only dry-run" : "write"} mode.`);

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS
  });
  const client = await pool.connect();

  try {
    console.log("PostgreSQL connected. Reading field-research contacts and place links...");
    const rawResult = await client.query<RawContact>(`
        SELECT source_row_id, place, region, contact_person, phone
        FROM public.field_research_raw
        WHERE source_row_id IS NOT NULL
          AND NULLIF(btrim(place), '') IS NOT NULL
          AND NULLIF(btrim(phone), '') IS NOT NULL
          AND lower(COALESCE(entry_type, 'place')) LIKE '%place%'
        ORDER BY place
      `);
    const placesResult = await client.query<PlaceRow>(
      `SELECT id, source_row_id, name FROM public.places`
    );
    const contactsResult = await client.query<ContactRow>(`
        SELECT id, name, phone, whatsapp, region
        FROM public.contacts
        WHERE NULLIF(btrim(phone), '') IS NOT NULL
      `);
    const existingLinksResult = await client.query<{ place_id: string; contact_id: string }>(`
        SELECT place_id, contact_id FROM public.place_contacts
      `);

    const placesBySource = new Map(
      placesResult.rows.filter((place) => place.source_row_id).map((place) => [place.source_row_id!, place])
    );
    const placesByName = new Map<string, PlaceRow[]>();
    for (const place of placesResult.rows) {
      const key = normalizedName(place.name);
      placesByName.set(key, [...(placesByName.get(key) ?? []), place]);
    }

    const contactsByPhone = new Map<string, ContactRow[]>();
    for (const contact of contactsResult.rows) {
      const key = normalizedPhone(contact.phone);
      if (!key) continue;
      contactsByPhone.set(key, [...(contactsByPhone.get(key) ?? []), contact]);
    }

    const contactPlans = new Map<string, ContactPlan>();
    const linkPlans = new Map<string, LinkPlan>();
    let skipped = 0;

    for (const raw of rawResult.rows) {
      const phone = text(raw.phone)!;
      const phoneKey = normalizedPhone(phone);
      if (!phoneKey) {
        console.warn(`Skipping ${raw.place}: phone contains no digits.`);
        skipped++;
        continue;
      }

      const sourceMatch = placesBySource.get(raw.source_row_id);
      const nameMatches = placesByName.get(normalizedName(raw.place)) ?? [];
      if (!sourceMatch && nameMatches.length !== 1) {
        console.warn(`Skipping ${raw.place}: matched ${nameMatches.length} places; expected exactly one.`);
        skipped++;
        continue;
      }
      const place = sourceMatch ?? nameMatches[0]!;

      const existingMatches = contactsByPhone.get(phoneKey) ?? [];
      if (existingMatches.length > 1) {
        throw new Error(`Phone ending in ${phoneKey.slice(-4)} matches multiple existing contacts.`);
      }

      const previousPlan = contactPlans.get(phoneKey);
      contactPlans.set(phoneKey, {
        key: phoneKey,
        phone,
        name: mergePreferred(previousPlan?.name ?? null, text(raw.contact_person)),
        region: mergePreferred(previousPlan?.region ?? null, text(raw.region)),
        existing: previousPlan?.existing ?? existingMatches[0]
      });
      linkPlans.set(`${place.id}:${phoneKey}`, { place, contactKey: phoneKey });
    }

    const existingLinks = new Set(
      existingLinksResult.rows.map((link) => `${link.place_id}:${link.contact_id}`)
    );
    const contacts = [...contactPlans.values()];
    const links = [...linkPlans.values()];
    const newContacts = contacts.filter((plan) => !plan.existing).length;
    const enrichedContacts = contacts.filter((plan) => plan.existing && (
      (!plan.existing.name && plan.name)
      || (!plan.existing.whatsapp && plan.phone)
      || (!plan.existing.region && plan.region)
    )).length;
    const newLinks = links.filter((plan) => {
      const contactId = contactPlans.get(plan.contactKey)?.existing?.id;
      return !contactId || !existingLinks.has(`${plan.place.id}:${contactId}`);
    }).length;

    if (dryRun) {
      console.log(
        `Read-only dry run complete: ${rawResult.rows.length} usable source rows; ` +
        `${newContacts} contacts would be inserted; ${enrichedContacts} existing contacts would be enriched; ` +
        `${newLinks} place links would be inserted; ${skipped} rows skipped. No database writes were made.`
      );
      return;
    }

    const result = await writePlans(client, contacts, links);
    console.log(
      `Contact sync complete: ${result.insertedContacts} contacts inserted; ` +
      `${result.updatedContacts} existing contacts enriched; ${result.insertedLinks} place links inserted; ` +
      `${skipped} rows skipped.`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Contact sync failed: ${message}`);
  process.exitCode = 1;
});
