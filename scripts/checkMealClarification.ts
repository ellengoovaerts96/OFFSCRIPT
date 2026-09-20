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
assert.notEqual(
  needsClarification({ ...broadBreakfastContext, requestedStyle: "international" }),
  "subcategory",
  "An international breakfast request must not ask for the breakfast style again."
);

console.log("Broad meal clarification checks passed.");
