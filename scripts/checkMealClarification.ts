import assert from "node:assert/strict";
import { buildClarifyingQuestion } from "../src/logic/buildClarifyingQuestion.js";
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

console.log("Broad meal clarification checks passed.");
