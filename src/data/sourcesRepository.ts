import { pool } from "../integrations/postgres.js";
import type {
  AcquisitionSource,
  SourceAcquisitionSummary,
  SourceFilters,
  SourceWriteInput
} from "../types/source.js";

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

type SourceSummaryRow = SourceRow & {
  acquired_user_count: string | number;
  first_acquired_at: Date | null;
  latest_acquired_at: Date | null;
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

function mapSourceSummary(row: SourceSummaryRow): SourceAcquisitionSummary {
  return {
    ...mapSource(row),
    acquiredUserCount: Number(row.acquired_user_count),
    firstAcquiredAt: row.first_acquired_at?.toISOString(),
    latestAcquiredAt: row.latest_acquired_at?.toISOString()
  };
}

const sourceSummarySelect = `
  SELECT
    s.id, s.code, s.slug, s.source_type, s.name, s.home_neighbourhood,
    s.latitude, s.longitude, s.active, s.created_at, s.updated_at,
    COUNT(wu.user_phone)::integer AS acquired_user_count,
    MIN(wu.acquired_at) AS first_acquired_at,
    MAX(wu.acquired_at) AS latest_acquired_at
  FROM public.sources s
  LEFT JOIN public.whatsapp_users wu ON wu.acquisition_source_id = s.id
`;

export async function listSources(filters: SourceFilters = {}): Promise<SourceAcquisitionSummary[]> {
  const search = filters.search?.trim() || null;
  const sourceType = filters.sourceType?.trim() || null;
  const neighbourhood = filters.neighbourhood?.trim() || null;
  const result = await pool.query<SourceSummaryRow>(
    `
      ${sourceSummarySelect}
      WHERE ($1::text IS NULL OR s.name ILIKE '%' || $1 || '%' OR s.slug ILIKE '%' || $1 || '%' OR s.code ILIKE '%' || $1 || '%')
        AND ($2::boolean IS NULL OR s.active = $2)
        AND ($3::text IS NULL OR s.source_type = $3)
        AND ($4::text IS NULL OR s.home_neighbourhood = $4)
      GROUP BY s.id
      ORDER BY s.active DESC, lower(s.name) ASC
    `,
    [search, filters.active ?? null, sourceType, neighbourhood]
  );
  return result.rows.map(mapSourceSummary);
}

export async function getSourceById(id: string): Promise<SourceAcquisitionSummary | null> {
  const result = await pool.query<SourceSummaryRow>(
    `
      ${sourceSummarySelect}
      WHERE s.id = $1
      GROUP BY s.id
      LIMIT 1
    `,
    [id]
  );
  return result.rows[0] ? mapSourceSummary(result.rows[0]) : null;
}

export async function createSource(
  input: SourceWriteInput & { code: string }
): Promise<AcquisitionSource> {
  const result = await pool.query<SourceRow>(
    `
      INSERT INTO public.sources (
        code, slug, source_type, name, home_neighbourhood,
        latitude, longitude, active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, code, slug, source_type, name, home_neighbourhood,
                latitude, longitude, active, created_at, updated_at
    `,
    [
      input.code,
      input.slug,
      input.sourceType,
      input.name,
      input.homeNeighbourhood ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.active
    ]
  );
  return mapSource(result.rows[0]);
}

export async function updateSource(id: string, input: SourceWriteInput): Promise<AcquisitionSource | null> {
  const result = await pool.query<SourceRow>(
    `
      UPDATE public.sources
      SET name = $2,
          slug = $3,
          source_type = $4,
          home_neighbourhood = $5,
          latitude = $6,
          longitude = $7,
          active = $8,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, code, slug, source_type, name, home_neighbourhood,
                latitude, longitude, active, created_at, updated_at
    `,
    [
      id,
      input.name,
      input.slug,
      input.sourceType,
      input.homeNeighbourhood ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.active
    ]
  );
  return result.rows[0] ? mapSource(result.rows[0]) : null;
}

export async function countAcquiredUsersForSource(sourceId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM public.whatsapp_users WHERE acquisition_source_id = $1`,
    [sourceId]
  );
  return Number(result.rows[0]?.count ?? 0);
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
