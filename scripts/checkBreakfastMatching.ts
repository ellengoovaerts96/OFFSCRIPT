import assert from "node:assert/strict";
import { buildSearchProfile } from "../src/logic/buildSearchProfile.js";
import {
  placePassesSearchProfileHardConstraints,
  placeServesBreakfast
} from "../src/logic/searchProfileMatching.js";
import { normalizeRegion } from "../src/utils/normalizeRegion.js";
import type { Place } from "../src/types/place.js";

function breakfastPlace(input: Partial<Place>): Place {
  return {
    id: input.id ?? "test",
    name: input.name ?? "Test place",
    country: "Senegal",
    region: "Dakar",
    vibeTags: [],
    offscriptPickLevel: 1,
    offscriptPriority: 50,
    audienceTags: [],
    occasionTags: input.occasionTags ?? [],
    dietaryTags: [],
    amenities: [],
    categories: ["food"],
    subcategories: input.subcategories ?? [],
    shortDescription: input.shortDescription ?? "A place serving food.",
    bestFor: [],
    notIdealFor: [],
    travellerTypes: [],
    childFriendly: false,
    bestTiming: input.bestTiming ?? [],
    closedDays: [],
    reservationNeeded: false,
    googleMapsUrl: "https://maps.example.test",
    guideAvailable: false,
    guideLanguages: [],
    images: [],
    status: "ready",
    ...input
  };
}

const loman = breakfastPlace({
  name: "Loman Art House",
  occasionTags: ["lunch", "brunch", "healthy food"],
  bestTiming: ["Afternoon", "Evening"],
  subcategories: [{ id: "lunch", name: "Lunch", displayOrder: 1, images: [] }]
});
const documentedBreakfast = breakfastPlace({
  name: "Documented breakfast café",
  occasionTags: ["breakfast", "international food"],
  bestTiming: ["Morning"],
  subcategories: [{ id: "breakfast", name: "Breakfast", displayOrder: 1, images: [] }]
});

assert.equal(placeServesBreakfast(loman), false, "Brunch alone must not prove that breakfast is served.");
assert.equal(placeServesBreakfast(documentedBreakfast), true);

const profile = buildSearchProfile(
  "Liever een echt internationaal ontbijt",
  {
    language: "nl",
    intent: "food",
    timing: "morning",
    requestedSubcategory: "breakfast",
    requestedStyle: "international"
  },
  undefined,
  {
    activity: "eat",
    products: [],
    occasions: ["breakfast"],
    vibes: ["international"],
    exclusions: {
      products: ["Breakfast"],
      categories: ["Breakfast"],
      audienceTags: [],
      dietary: []
    }
  }
);

assert.ok(profile.occasions.includes("breakfast"));
assert.ok(!profile.exclusions.products.some((value) => value.toLowerCase() === "breakfast"));
assert.ok(!profile.exclusions.categories.some((value) => value.toLowerCase() === "breakfast"));
assert.equal(placePassesSearchProfileHardConstraints(loman, profile), false);
assert.equal(placePassesSearchProfileHardConstraints(documentedBreakfast, profile), true);
assert.equal(normalizeRegion("Mamelles"), "Ouakam");
assert.equal(normalizeRegion("Les Mamelles"), "Ouakam");

console.log("Breakfast evidence, contradiction cleanup and Mamelles geography checks passed.");
