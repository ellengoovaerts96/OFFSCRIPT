import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../migrations/053_place_videos_admin.sql", import.meta.url), "utf8");
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.place_videos/);
assert.match(migration, /place_id UUID NOT NULL REFERENCES public\.places\(id\) ON DELETE CASCADE/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS place_videos_place_id_unique/);
assert.match(migration, /cloudinary_public_id TEXT NOT NULL/);
assert.match(migration, /poster_url TEXT NOT NULL/);
assert.match(migration, /duration_seconds NUMERIC/);
assert.match(migration, /file_size_bytes BIGINT/);
assert.doesNotMatch(migration, /DELETE FROM|TRUNCATE/i);

const cloudinary = await readFile(new URL("../src/integrations/cloudinary.ts", import.meta.url), "utf8");
assert.match(cloudinary, /resource_type: "video"/);
assert.match(cloudinary, /posterUrl: cloudinary\.url/);
assert.match(cloudinary, /start_offset: "0"/);

const repository = await readFile(new URL("../src/data/placesAdminRepository.ts", import.meta.url), "utf8");
assert.match(repository, /ON CONFLICT \(place_id\) DO UPDATE SET/);
assert.match(repository, /DELETE FROM public\.place_videos WHERE id = \$1 AND place_id = \$2/);

const recommendationRepository = await readFile(new URL("../src/data/placesRepository.ts", import.meta.url), "utf8");
assert.match(recommendationRepository, /FROM place_videos pv/);
assert.match(recommendationRepository, /videoUrl: row\.video_url/);

const whatsapp = await readFile(new URL("../src/channels/whatsapp.ts", import.meta.url), "utf8");
assert.match(whatsapp, /buildRecommendationTextMessages\(reply, followUpMessages\)/);
assert.match(whatsapp, /maximumLength = 1400/);
const photoPosition = whatsapp.indexOf("for (const imageUrl of imageUrls)");
const videoPosition = whatsapp.indexOf("for (const videoUrl of videoUrls)");
assert.ok(photoPosition >= 0 && videoPosition > photoPosition, "Photos must be sent before video.");

const router = await readFile(new URL("../src/channels/placesAdmin.ts", import.meta.url), "utf8");
assert.match(router, /videoUpload\.single\("video"\)/);
assert.match(router, /fileSize: 100 \* 1024 \* 1024/);
assert.match(router, /video\.durationSeconds > 30/);
assert.match(router, /video\.width \/ video\.height - 9 \/ 16/);
assert.doesNotMatch(router, /destroy\(|delete_resources|uploader\.destroy/);

console.log("Place video migration, upload, poster and unlink safety checks passed.");
