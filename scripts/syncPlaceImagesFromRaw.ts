import "dotenv/config";
import pg, { type PoolClient } from "pg";

type RawPlaceImages = {
  id: string;
  place: string;
  image_1: string | null;
  image_2: string | null;
  image_3: string | null;
};

type PlaceRow = {
  id: string;
  name: string;
};

type ImageRow = {
  id: string;
  place_id: string;
  url: string;
  sort_order: number;
  is_hero_image: boolean;
};

type ImagePlan = {
  place: PlaceRow;
  desiredUrls: string[];
  current: ImageRow[];
  add: string[];
  remove: ImageRow[];
  reorder: boolean;
};

function normalizePlaceName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedUrl(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function uniqueUrls(row: RawPlaceImages): string[] {
  return Array.from(
    new Set([row.image_1, row.image_2, row.image_3].map(normalizedUrl).filter((url): url is string => Boolean(url)))
  ).slice(0, 3);
}

function groupByNormalizedName<T>(rows: T[], name: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = normalizePlaceName(name(row));
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function applyPlan(client: PoolClient, plan: ImagePlan): Promise<void> {
  const desired = new Set(plan.desiredUrls);
  const deleteIds = plan.current.filter((image) => !desired.has(image.url)).map((image) => image.id);

  if (deleteIds.length > 0) {
    await client.query(
      `DELETE FROM public.place_images WHERE place_id = $1 AND id = ANY($2::uuid[])`,
      [plan.place.id, deleteIds]
    );
  }

  // Move retained rows out of the final 0..2 range before assigning the new
  // order, avoiding temporary conflicts with the unique sort-order index.
  await client.query(
    `UPDATE public.place_images SET sort_order = sort_order - 1000 WHERE place_id = $1`,
    [plan.place.id]
  );

  for (const [sortOrder, url] of plan.desiredUrls.entries()) {
    const existing = plan.current.find((image) => image.url === url);
    if (existing) {
      await client.query(
        `UPDATE public.place_images SET sort_order = $1 WHERE id = $2 AND place_id = $3`,
        [sortOrder, existing.id, plan.place.id]
      );
    } else {
      await client.query(
        `
          INSERT INTO public.place_images (place_id, url, sort_order, is_hero_image)
          VALUES ($1, $2, $3, false)
        `,
        [plan.place.id, url, sortOrder]
      );
    }
  }

  if (plan.desiredUrls.length > 0) {
    const hero = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM public.place_images WHERE place_id = $1 AND is_hero_image IS TRUE`,
      [plan.place.id]
    );
    if (hero.rows[0]?.count === 0) {
      await client.query(
        `UPDATE public.place_images SET is_hero_image = true WHERE place_id = $1 AND sort_order = 0`,
        [plan.place.id]
      );
    }
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is missing.");

  const dryRun = process.argv.includes("--dry-run");
  const { Pool } = pg;
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
  });
  const client = await pool.connect();

  try {
    const rawResult = await client.query<RawPlaceImages>(`
      SELECT id, place, image_1, image_2, image_3
      FROM public.field_research_raw
      WHERE NULLIF(btrim(place), '') IS NOT NULL
      ORDER BY place
    `);
    const placesResult = await client.query<PlaceRow>(
      `SELECT id, name FROM public.places ORDER BY name`
    );
    const imagesResult = await client.query<ImageRow>(`
      SELECT id, place_id, url, sort_order, is_hero_image
      FROM public.place_images
      ORDER BY place_id, sort_order
    `);

    const rawByName = groupByNormalizedName(rawResult.rows, (row) => row.place);
    const placesByName = groupByNormalizedName(placesResult.rows, (row) => row.name);
    const imagesByPlace = new Map<string, ImageRow[]>();
    for (const image of imagesResult.rows) {
      imagesByPlace.set(image.place_id, [...(imagesByPlace.get(image.place_id) ?? []), image]);
    }

    const plans: ImagePlan[] = [];
    let skippedMissingPlace = 0;
    let skippedAmbiguous = 0;

    for (const [key, rawRows] of rawByName) {
      if (rawRows.length !== 1) {
        skippedAmbiguous += rawRows.length;
        console.warn(`Skipping ambiguous Raw place name "${rawRows[0]!.place}": ${rawRows.length} Raw rows.`);
        continue;
      }

      const matchingPlaces = placesByName.get(key) ?? [];
      if (matchingPlaces.length === 0) {
        skippedMissingPlace += 1;
        console.warn(`Skipping Raw place "${rawRows[0]!.place}": no matching row in public.places.`);
        continue;
      }
      if (matchingPlaces.length !== 1) {
        skippedAmbiguous += 1;
        console.warn(`Skipping Raw place "${rawRows[0]!.place}": ${matchingPlaces.length} matching Places rows.`);
        continue;
      }

      const place = matchingPlaces[0]!;
      const desiredUrls = uniqueUrls(rawRows[0]!);
      const current = imagesByPlace.get(place.id) ?? [];
      const currentUrls = current.map((image) => image.url);
      if (arraysEqual(desiredUrls, currentUrls)) continue;

      const desiredSet = new Set(desiredUrls);
      const currentSet = new Set(currentUrls);
      plans.push({
        place,
        desiredUrls,
        current,
        add: desiredUrls.filter((url) => !currentSet.has(url)),
        remove: current.filter((image) => !desiredSet.has(image.url)),
        reorder: desiredUrls.some((url, index) => currentUrls[index] !== url)
      });
    }

    for (const plan of plans) {
      console.log(JSON.stringify({
        place: plan.place.name,
        add: plan.add,
        remove: plan.remove.map((image) => image.url),
        finalOrder: plan.desiredUrls
      }));
    }

    if (!dryRun && plans.length > 0) {
      await client.query("BEGIN");
      try {
        for (const plan of plans) await applyPlan(client, plan);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    const added = plans.reduce((count, plan) => count + plan.add.length, 0);
    const removed = plans.reduce((count, plan) => count + plan.remove.length, 0);
    console.log(
      `${dryRun ? "Dry run" : "Sync"} complete: ${plans.length} places changed; ` +
      `${added} images added; ${removed} images removed; ` +
      `${skippedMissingPlace} Raw places missing from Places; ${skippedAmbiguous} ambiguous rows skipped.`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`Place image sync failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
