import assert from "node:assert/strict";
import { buildClarifyingQuestion } from "../src/logic/buildClarifyingQuestion.js";
import { buildSearchProfile } from "../src/logic/buildSearchProfile.js";
import { needsClarification } from "../src/logic/needsClarification.js";
import type { UserContext } from "../src/types/userContext.js";

const broadLunchContext: UserContext = {
  language: "nl",
  targetRegion: "Yoff",
  intent: "food",
  timing: "lunch",
  clarificationCount: 1
};

assert.equal(
  needsClarification(broadLunchContext),
  "subcategory",
  "A broad lunch request must ask what kind of food the user wants before selecting a place."
);
assert.match(
  buildClarifyingQuestion("subcategory", broadLunchContext),
  /Welke keuken/i,
  "The Dutch broad-lunch clarification must ask naturally about cuisine."
);
assert.notEqual(
  needsClarification({ ...broadLunchContext, requestedSubcategory: "pizza" }),
  "subcategory",
  "An explicitly requested lunch dish must not be asked again."
);

const semanticLunchContext: UserContext = {
  language: "nl",
  targetRegion: "Yoff",
  intent: "food",
  timing: "lunch",
  requestedSubcategory: "Lunch",
  clarificationCount: 1
};
assert.equal(
  needsClarification(semanticLunchContext),
  "subcategory",
  "The semantic Lunch subcategory is a meal moment, not a cuisine choice."
);
assert.match(buildClarifyingQuestion("subcategory", semanticLunchContext), /Welke keuken/i);
const semanticLunchProfile = buildSearchProfile(
  "Waar kan ik vanmiddag gaan lunchen?",
  semanticLunchContext,
  undefined,
  {
    activity: "eat",
    products: ["lunch"],
    locationFeatures: [],
    occasions: ["lunch"],
    vibes: [],
    exclusions: { products: [], categories: [], audienceTags: [], dietary: [] }
  }
);
assert.ok(!semanticLunchProfile.products.includes("lunch"), "Lunch belongs to occasions, not products.");
assert.ok(semanticLunchProfile.occasions.includes("lunch"));

const internationalLunchContext: UserContext = {
  ...semanticLunchContext,
  requestedSubcategory: "International Food",
  requestedStyle: "international"
};
assert.equal(
  needsClarification(internationalLunchContext),
  "subcategory",
  "International food is still too broad to select one cuisine arbitrarily."
);
assert.match(buildClarifyingQuestion("subcategory", internationalLunchContext), /Italiaans\/pizza/i);
const internationalLunchProfile = buildSearchProfile(
  "Internationaal",
  internationalLunchContext,
  undefined,
  {
    activity: "eat",
    products: ["international_food"],
    locationFeatures: [],
    occasions: [],
    vibes: ["international"],
    exclusions: { products: [], categories: [], audienceTags: [], dietary: [] }
  }
);
assert.ok(
  !internationalLunchProfile.products.includes("international_food"),
  "International is a style and ranking preference, not a hard product requirement."
);

const broadBreakfastContext: UserContext = {
  language: "nl",
  targetRegion: "Yoff",
  intent: "food",
  timing: "morning",
  requestedSubcategory: "breakfast",
  clarificationCount: 1
};
assert.equal(
  needsClarification(broadBreakfastContext),
  "subcategory",
  "A broad breakfast request must ask what kind of breakfast the user wants."
);
assert.match(
  buildClarifyingQuestion("subcategory", broadBreakfastContext),
  /Wat voor ontbijt/i
);
assert.equal(
  needsClarification({ ...broadBreakfastContext, requestedStyle: "international" }),
  "subcategory",
  "International breakfast still needs a more specific cuisine/style choice."
);
assert.match(
  buildClarifyingQuestion("subcategory", { ...broadBreakfastContext, requestedStyle: "international" }),
  /Italiaans\/pizza/i
);

const americanBreakfastContext: UserContext = {
  language: "en",
  intent: "food",
  timing: "morning",
  requestedSubcategory: "breakfast",
  directRequest: true,
  clarificationCount: 0,
  searchProfile: {
    activity: "eat", products: ["american_breakfast"], locationFeatures: [], occasions: ["breakfast"],
    vibes: [], amenities: [], dietaryRequirements: [],
    exclusions: { products: [], categories: [], audienceTags: [], dietary: [] }
  }
};
assert.equal(
  needsClarification(americanBreakfastContext, []),
  "location",
  "American breakfast is already specific; only the missing neighbourhood may be requested."
);
assert.notEqual(
  needsClarification({ ...americanBreakfastContext, targetRegion: "Yoff" }, []),
  "subcategory",
  "An exact breakfast dish must never trigger another cuisine or breakfast-format question."
);

console.log("Broad meal clarification checks passed.");
