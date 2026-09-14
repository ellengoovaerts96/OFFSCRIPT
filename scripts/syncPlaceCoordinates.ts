import "dotenv/config";
import pg from "pg";
import { coordinatesFromGoogleMapsUrl } from "../src/logic/googleMapsCoordinates.js";

const dryRun = process.argv.includes("--dry-run");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--dry-run");
const REQUEST_TIMEOUT_MS = 15_000;

type Place = {
  id: string;
  name: string;
  google_maps_url: string;
};

async function resolveCoordinates(url: string): Promise<ReturnType<typeof coordinatesFromGoogleMapsUrl>> {
  const direct = coordinatesFromGoogleMapsUrl(url);
  if (direct) return direct;

  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "user-agent": "TUUTI-place-coordinate-sync/1.0" }
  });
  await response.body?.cancel();
  return coordinatesFromGoogleMapsUrl(response.url);
}

async function main(): Promise<void> {
  if (unknownArguments.length) {
    throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}. Supported: --dry-run`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is missing.");

  console.log(`Place-coordinate sync starting in ${dryRun ? "read-only dry-run" : "write"} mode.`);
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 15_000
  });
  const client = await pool.connect();
  let resolved = 0;
  let unresolved = 0;

  try {
    const result = await client.query<Place>(`
      SELECT id, name, google_maps_url
      FROM public.places
      WHERE google_maps_url IS NOT NULL
        AND btrim(google_maps_url) <> ''
        AND (latitude IS NULL OR longitude IS NULL)
      ORDER BY name
    `);
    console.log(`Found ${result.rowCount} places with a Maps link and missing coordinates.`);
    if (!dryRun) await client.query("BEGIN");

    for (const place of result.rows) {
      try {
        const coordinates = await resolveCoordinates(place.google_maps_url);
        if (!coordinates) {
          unresolved++;
          console.warn(`Unresolved: ${place.name}`);
          continue;
        }

        if (!dryRun) {
          await client.query(
            `UPDATE public.places
             SET latitude = $1, longitude = $2, updated_at = NOW()
             WHERE id = $3 AND (latitude IS NULL OR longitude IS NULL)`,
            [coordinates.latitude, coordinates.longitude, place.id]
          );
        }
        resolved++;
        console.log(`${dryRun ? "Would update" : "Updated"}: ${place.name} (${coordinates.latitude}, ${coordinates.longitude})`);
      } catch (error) {
        unresolved++;
        console.warn(`Unresolved: ${place.name} (${error instanceof Error ? error.message : String(error)})`);
      }
    }

    if (!dryRun) await client.query("COMMIT");
    console.log(`${dryRun ? "Dry run" : "Sync"} complete: ${resolved} resolved; ${unresolved} unresolved.`);
  } catch (error) {
    if (!dryRun) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Place-coordinate sync failed", error);
  process.exitCode = 1;
});
