import { pool } from "../integrations/postgres.js";
import type { Experience } from "../types/experience.js";
import type { UserContext } from "../types/userContext.js";

type ExperienceRow = {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  full_description: string | null;
  duration: string | null;
  location: string | null;
  exact_area: string | null;
  vibe: string | null;
  price: string | null;
  currency: string | null;
  max_people: number | null;
  child_friendly: boolean | null;
  meeting_point: string | null;
  reservation_required: boolean | null;
  whatsapp_prefill_text: string | null;
};

const defaultSiteUrl = "https://go-offscript.app";

function createExperienceUrl(slug: string): string {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || defaultSiteUrl).replace(/\/$/, "");
  return `${siteUrl}/experiences/${slug}`;
}

async function experiencesTableExists(): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    "SELECT to_regclass('public.experiences') IS NOT NULL AS exists"
  );

  return result.rows[0]?.exists ?? false;
}

function contextSearchTerms(context: UserContext): string[] {
  return [
    context.intent,
    context.targetRegion,
    context.currentLocation,
    context.timing,
    context.travellerType,
    context.vibe
  ].filter((value): value is string => Boolean(value && value !== "unknown"));
}

function mapExperience(row: ExperienceRow): Experience {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    shortDescription: row.short_description ?? undefined,
    fullDescription: row.full_description ?? undefined,
    duration: row.duration ?? undefined,
    location: row.location ?? undefined,
    exactArea: row.exact_area ?? undefined,
    vibe: row.vibe ?? undefined,
    price: row.price ? Number(row.price) : undefined,
    currency: row.currency ?? "EUR",
    maxPeople: row.max_people ?? undefined,
    childFriendly: row.child_friendly ?? false,
    meetingPoint: row.meeting_point ?? undefined,
    reservationRequired: row.reservation_required ?? true,
    whatsappPrefillText: row.whatsapp_prefill_text ?? undefined,
    url: createExperienceUrl(row.slug)
  };
}

export async function listRelevantExperiencesForContext(
  context: UserContext,
  limit = 3
): Promise<Experience[]> {
  if (!(await experiencesTableExists())) {
    return [];
  }

  const terms = contextSearchTerms(context);
  const hasTerms = terms.length > 0;

  const result = await pool.query<ExperienceRow>(
    `
      SELECT
        id,
        title,
        slug,
        short_description,
        full_description,
        duration,
        location,
        exact_area,
        vibe,
        price,
        currency,
        max_people,
        child_friendly,
        meeting_point,
        reservation_required,
        whatsapp_prefill_text
      FROM experiences
      WHERE status = 'published'
        AND ($1::boolean = false OR (
          title ILIKE ANY($2::text[])
          OR COALESCE(short_description, '') ILIKE ANY($2::text[])
          OR COALESCE(full_description, '') ILIKE ANY($2::text[])
          OR COALESCE(location, '') ILIKE ANY($2::text[])
          OR COALESCE(exact_area, '') ILIKE ANY($2::text[])
          OR COALESCE(vibe, '') ILIKE ANY($2::text[])
        ))
        AND ($3::boolean = false OR child_friendly = true)
      ORDER BY featured DESC, updated_at DESC, title ASC
      LIMIT $4
    `,
    [
      hasTerms,
      terms.map((term) => `%${term}%`),
      context.travellerType === "family" || context.hasChildren === true,
      limit
    ]
  );

  return result.rows.map(mapExperience);
}
