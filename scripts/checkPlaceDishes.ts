import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSearchProfile } from "../src/logic/buildSearchProfile.js";
import { searchTermMatchStrength } from "../src/logic/searchProfileMatching.js";
import type { Place } from "../src/types/place.js";

const migration = await readFile(new URL("../migrations/056_place_dishes.sql", import.meta.url), "utf8");
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.dishes/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.dish_aliases/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.place_dishes/);
assert.match(migration, /known_for.*usually_available.*sometimes_available/s);
assert.match(migration, /grilled_fish/);
assert.doesNotMatch(migration, /DELETE FROM|TRUNCATE/i);

const foodContext = { language: "nl", intent: "food" } as const;
const profile = buildSearchProfile("Waar kan ik gegrilde dorade eten?", foodContext);
assert.deepEqual(profile.products, ["grilled_fish"]);
assert.deepEqual(buildSearchProfile("Where can I eat ceebu jën?", foodContext).products, ["thieboudienne"]);
assert.deepEqual(buildSearchProfile("Ik wil mafé eten", foodContext).products, ["mafe"]);
assert.deepEqual(buildSearchProfile("Je cherche du soupou kandja", foodContext).products, ["soupe_kandia"]);

const base = {
  id: "1", name: "Test", country: "Senegal", region: "Dakar", vibeTags: [],
  offscriptPickLevel: 1, offscriptPriority: 50, audienceTags: [], occasionTags: [], dietaryTags: [], amenities: [],
  workFriendly: false, categories: ["food"], subcategories: [], shortDescription: "Senegalese restaurant",
  bestFor: [], notIdealFor: [], travellerTypes: [], childFriendly: false, bestTiming: [], closedDays: [],
  reservationNeeded: false, googleMapsUrl: "https://maps.example", guideAvailable: false, guideLanguages: [], images: [], status: "ready"
} as Place;

assert.equal(searchTermMatchStrength(base, "thieboudienne"), 0, "Senegalese food alone must not prove a dish.");
assert.equal(searchTermMatchStrength({ ...base, dishes: [{ key: "thieboudienne", name: "Thiéboudienne", availabilityStatus: "usually_available", source: "dashboard" }] }, "thieboudienne"), 5);
assert.equal(searchTermMatchStrength({ ...base, dishes: [{ key: "grilled_fish", name: "Grilled fish", availabilityStatus: "known_for", source: "dashboard" }] }, "grilled_fish"), 6);

const admin = await readFile(new URL("../src/channels/placesAdmin.ts", import.meta.url), "utf8");
assert.match(admin, /savePlaceDish/);
assert.match(admin, /removePlaceDish/);
console.log("Dish catalogue, aliases, confidence matching and dashboard management checks passed.");
