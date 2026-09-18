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
assert.doesNotMatch(list, /DATABASE_URL|INBOX_PASSWORD/);

const detail = renderPlaceAdminDetail({
  ...summary,
  country: "Senegal",
  shortDescription: "A warm local bar.", shortDescriptionEn: null, shortDescriptionFr: null,
  practicalInfo: null, practicalInfoEn: null, practicalInfoFr: null,
  personalTip: null, personalTipEn: null, personalTipFr: null,
  offscriptReasonNl: null, offscriptReasonEn: "A TUUTI favourite.", offscriptReasonFr: null,
  authenticity: 3, foodOrientation: 0, audienceOrientation: 0, audienceTags: ["residents", "expats"],
  adventureLevel: 1, occasionTags: ["friends"], amenities: ["outdoor_seating"], workFriendly: false,
  priceLevel: 2, vibe: "lively", vibeTags: ["local"], bestFor: ["drinks"], notIdealFor: [], travellerTypes: ["friends"],
  bestTiming: ["evening"], openingHours: "18:00–02:00", googleMapsUrl: "https://maps.example/a", instagramUrl: null,
  facebookUrl: null, tiktokUrl: null, latitude: 14.7, longitude: -17.4, lastVerifiedAt: null, source: "field research",
  images: [{ id: "image-1", url: "https://images.example/a.jpg", altText: "Terrace", caption: null, isHeroImage: true }],
  createdAt: "2026-01-01T00:00:00.000Z"
});
assert.match(detail, /Overview/);
assert.match(detail, /TUUTI editorial/);
assert.match(detail, /Photos/);
assert.match(detail, /future Events tab/);
assert.match(detail, /target="_blank" rel="noreferrer"/);

const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../src/channels/placesAdmin.ts", import.meta.url), "utf8");
assert.match(app, /app\.use\("\/admin\/places", placesAdminRouter\)/);
assert.match(router, /placesAdminRouter\.use\(requireAdminBasicAuth\)/);
assert.doesNotMatch(router, /\.post\(|\.delete\(|UPDATE |DELETE FROM/i);

console.log("Places admin rendering and route checks passed.");
