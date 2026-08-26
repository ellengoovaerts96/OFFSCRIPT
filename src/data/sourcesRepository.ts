import { pool } from "../integrations/postgres.js";
import type { AcquisitionSource } from "../types/source.js";

type SourceRow = {
  id: string;
  code: string;
  slug: string;
  source_type: string;
  name: string;
  home_neighbourhood: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

function mapSource(row: SourceRow): AcquisitionSource {
  return {
    id: row.id,
    code: row.code,
    slug: row.slug,
    sourceType: row.source_type,
    name: row.name,
    homeNeighbourhood: row.home_neighbourhood ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export async function getSourceBySlug(slug: string): Promise<AcquisitionSource | null> {
  const result = await pool.query<SourceRow>(
    `
      SELECT id, code, slug, source_type, name, home_neighbourhood,
             latitude, longitude, active, created_at, updated_at
      FROM public.sources
      WHERE lower(slug) = lower($1)
      LIMIT 1
    `,
    [slug]
  );

  return result.rows[0] ? mapSource(result.rows[0]) : null;
}

export async function getSourceByCode(code: string): Promise<AcquisitionSource | null> {
  const result = await pool.query<SourceRow>(
    `
      SELECT id, code, slug, source_type, name, home_neighbourhood,
             latitude, longitude, active, created_at, updated_at
      FROM public.sources
      WHERE upper(code) = upper($1)
      LIMIT 1
    `,
    [code]
  );

  return result.rows[0] ? mapSource(result.rows[0]) : null;
}
