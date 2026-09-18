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
assert.match(sync, /image\.source === "field_research" && !desired\.has/);
assert.match(sync, /source IS DISTINCT FROM 'field_research'/);
assert.match(sync, /source\)\s*\n\s*VALUES \(\$1, \$2, \$3, false, 'field_research'\)/);
assert.doesNotMatch(sync, /DELETE FROM public\.place_images WHERE place_id = \$1(?! AND id)/);

const cloudinary = await readFile(new URL("../src/integrations/cloudinary.ts", import.meta.url), "utf8");
assert.match(cloudinary, /CLOUDINARY_API_SECRET/);
assert.doesNotMatch(cloudinary, /process\.env\.CLOUDINARY_API_SECRET[^\n]*return/);

console.log("Place photo migration, sync ownership and Cloudinary safety checks passed.");
