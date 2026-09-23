import { normalizePlacePhone, placePhoneMessage } from "../src/logic/placePhone.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderPlaceAdminDetail, renderPlacesAdminList } from "../src/logic/placesAdminHtml.js";

const summary = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Aïman Bar",
  region: "Dakar",
  neighbourhood: "Ngor",
  area: "Almadies",
  categories: ["food_and_drink"],
  subcategories: ["bar", "dinner"],
  status: "ready",
  offscriptPickLevel: 2,
  offscriptPriority: 84,
  imageCount: 2,
  updatedAt: "2026-09-18T00:00:00.000Z"
};

const list = renderPlacesAdminList({
  places: [summary],
  filters: { search: "Aïman", neighbourhood: "Ngor" },
  options: { neighbourhoods: ["Ngor"], categories: ["food_and_drink"], statuses: ["ready"] }
});
assert.match(list, /Places &amp; Content/);
assert.match(list, /Aïman Bar/);
assert.match(list, /name="search"/);
assert.match(list, /name="neighbourhood"/);
assert.match(list, /name="category"/);
assert.match(list, /name="status"/);
assert.match(list, /Events · later/);
assert.match(list, /class="mobile-back"/);
assert.match(list, /history\.back\(\)/);
assert.doesNotMatch(list, /DATABASE_URL|INBOX_PASSWORD/);

const detail = renderPlaceAdminDetail({ place: {
  ...summary,
  country: "Senegal",
  shortDescription: "A warm local bar.", shortDescriptionEn: null, shortDescriptionFr: null,
  practicalInfo: null, practicalInfoEn: null, practicalInfoFr: null,
  personalTip: null, personalTipEn: null, personalTipFr: null,
  offscriptReasonNl: null, offscriptReasonEn: "A TUUTI favourite.", offscriptReasonFr: null,
  authenticity: 3, foodOrientation: 0, audienceOrientation: 0, audienceTags: ["residents", "expats"],
  adventureLevel: 1, occasionTags: ["friends"], dietaryTags: ["vegetarian_options"], amenities: ["outdoor_seating"], workFriendly: false,
  priceLevel: 2, vibe: "lively", vibeTags: ["local"], bestFor: ["drinks"], notIdealFor: [], travellerTypes: ["friends"],
  bestTiming: ["evening"], openingHours: "18:00–02:00", googleMapsUrl: "https://maps.example/a", instagramUrl: null,
  facebookUrl: null, tiktokUrl: null, latitude: 14.7, longitude: -17.4, lastVerifiedAt: null, source: "field research",
  images: [{ id: "22222222-2222-4222-8222-222222222222", url: "https://images.example/a.jpg", altText: "Terrace", caption: null, isHeroImage: true, sortOrder: 0, source: "dashboard", cloudinaryPublicId: "tuuti/a", originalFilename: "a.jpg", width: 1200, height: 1500 }],
  video: { id: "33333333-3333-4333-8333-333333333333", url: "https://videos.example/a.mp4", cloudinaryPublicId: "tuuti/a-video", posterUrl: "https://images.example/a-video.jpg", originalFilename: "a.mp4", width: 1080, height: 1920, durationSeconds: 12.5, format: "mp4", fileSizeBytes: 5000000, source: "dashboard", createdAt: "2026-09-19T00:00:00.000Z", updatedAt: "2026-09-19T00:00:00.000Z" },
  feedback: [{ id: "44444444-4444-4444-8444-444444444444", rating: "loved", reason: null, freeText: null, positiveDetail: "Wonderful atmosphere.", travellerType: "couple", requestedVibe: "relaxed", createdAt: "2026-09-20T00:00:00.000Z" }],
  createdAt: "2026-01-01T00:00:00.000Z",
  editorialLockedFields: ["price_level"], editorialUpdatedAt: "2026-09-20T00:00:00.000Z", editorialUpdatedBy: "ellen",
  statusBeforeArchive: null, archivedAt: null
}, csrfToken: "csrf-test", cloudinaryReady: true });
assert.match(detail, /Overview/);
assert.match(detail, /TUUTI editorial/);
assert.match(detail, /vegetarian_options/);
assert.match(detail, /Photos/);
assert.match(detail, /future Events tab/);
assert.match(detail, /target="_blank" rel="noreferrer"/);
assert.match(detail, /multiple required/);
assert.match(detail, /1200 × 1500 px/);
assert.match(detail, /One active video per place/);
assert.match(detail, /12\.5 seconds/);
assert.match(detail, /poster="https:\/\/images\.example\/a-video\.jpg"/);
assert.match(detail, /Remove link/);
assert.match(detail, /Cloudinary asset will not be deleted/);
assert.match(detail, /Edit/);
assert.match(detail, /price level/);
assert.match(detail, /Opening hours/);
assert.match(detail, /Use Field Research again/);
assert.match(detail, /Archive place/);
assert.match(detail, /Feedback/);
assert.match(detail, /Loved it/);
assert.match(detail, /Wonderful atmosphere/);
assert.doesNotMatch(detail, /user_phone/);

const editDetail = renderPlaceAdminDetail({ place: {
  ...summary,
  country: "Senegal", shortDescription: "A warm local bar.", shortDescriptionEn: "A warm local bar.", shortDescriptionFr: null,
  practicalInfo: null, practicalInfoEn: null, practicalInfoFr: null, personalTip: null, personalTipEn: null, personalTipFr: null,
  offscriptReasonNl: null, offscriptReasonEn: null, offscriptReasonFr: null, authenticity: null, foodOrientation: null,
  audienceOrientation: null, audienceTags: [], adventureLevel: null, occasionTags: [], dietaryTags: [], amenities: [], workFriendly: null,
  priceLevel: 2, vibe: null, vibeTags: [], bestFor: [], notIdealFor: [], travellerTypes: [], bestTiming: [], openingHours: null,
  googleMapsUrl: "https://maps.example/a", instagramUrl: null, facebookUrl: null, tiktokUrl: null, latitude: null, longitude: null,
  lastVerifiedAt: null, source: null, images: [], video: null, feedback: [], createdAt: "2026-01-01T00:00:00.000Z",
  editorialLockedFields: [], editorialUpdatedAt: null, editorialUpdatedBy: null, statusBeforeArchive: null, archivedAt: null
}, csrfToken: "csrf-test", cloudinaryReady: true, edit: true });
assert.match(editDetail, /name="reservation_phone" type="tel"/);
assert.equal(normalizePlacePhone("00221 77 123 45 67"), "+221771234567");
assert.equal(normalizePlacePhone(""), null);
assert.throws(() => normalizePlacePhone("771234567"), /country code/);
assert.throws(() => normalizePlacePhone("+221771234567;bad"), /country code/);
assert.equal(placePhoneMessage("+221 77 123 45 67"), "📞 +221771234567\n💬 WhatsApp: https://wa.me/221771234567");
assert.equal(placePhoneMessage(undefined), undefined);
assert.equal(placePhoneMessage("771234567"), undefined);
assert.match(editDetail, /Save editorial changes/);
assert.match(editDetail, /name="subcategories"/);
assert.match(editDetail, /name="offscript_priority"/);
assert.match(editDetail, /name="work_friendly"/);

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../src/channels/placesAdmin.ts", import.meta.url), "utf8");
const repository = await readFile(new URL("../src/data/placesAdminRepository.ts", import.meta.url), "utf8");
assert.match(app, /app\.use\("\/admin\/places", placesAdminRouter\)/);
assert.match(router, /placesAdminRouter\.use\(requireAdminBasicAuth\)/);
assert.match(router, /photoUpload\.array\("photos", 20\)/);
assert.match(router, /requireAdminCsrf/);
assert.match(router, /updatePlaceEditorial/);
assert.match(router, /unlockPlaceEditorialField/);
assert.match(router, /archivePlace/);
assert.match(router, /restorePlace/);
assert.match(repository, /recommendation_feedback/);
assert.doesNotMatch(repository, /'userPhone'/);

console.log("Places admin rendering and route checks passed.");
