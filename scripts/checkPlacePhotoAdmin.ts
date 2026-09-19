import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../migrations/052_place_images_cloudinary_admin.sql", import.meta.url), "utf8");
assert.match(migration, /cloudinary_public_id TEXT/);
assert.match(migration, /original_filename TEXT/);
assert.match(migration, /source IN \('field_research', 'dashboard'\)/);
assert.match(migration, /DROP TRIGGER IF EXISTS max_three_place_images/);
assert.doesNotMatch(migration, /UPDATE public\.place_images/);
assert.doesNotMatch(migration, /DELETE FROM public\.place_images/);

const sync = await readFile(new URL("./syncPlaceImagesFromRaw.ts", import.meta.url), "utf8");
assert.match(sync, /Published place photos are managed only through the TUUTI dashboard/);
assert.doesNotMatch(sync, /INSERT INTO public\.place_images/i);
assert.doesNotMatch(sync, /UPDATE public\.place_images/i);
assert.doesNotMatch(sync, /DELETE FROM public\.place_images/i);
assert.doesNotMatch(sync, /new Pool|pool\.connect|client\.query/);

const cloudinary = await readFile(new URL("../src/integrations/cloudinary.ts", import.meta.url), "utf8");
assert.match(cloudinary, /CLOUDINARY_API_SECRET/);
assert.match(cloudinary, /format: "jpg"/);
assert.match(cloudinary, /width: 1200/);
assert.match(cloudinary, /height: 1500/);
assert.match(cloudinary, /crop: "fill"/);
assert.match(cloudinary, /quality: "auto:good"/);
assert.doesNotMatch(cloudinary, /process\.env\.CLOUDINARY_API_SECRET[^\n]*return/);

console.log("Place photo migration, dashboard-only publishing and Cloudinary safety checks passed.");
