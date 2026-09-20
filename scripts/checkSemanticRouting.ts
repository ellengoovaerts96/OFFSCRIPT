import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

delete process.env.OPENAI_API_KEY;
const { buildUserContext } = await import("../src/ai/buildUserContext.js");

const previous = {
  language: "nl",
  intent: "food" as const,
  requestedSubcategory: "sushi",
  requestedStyle: "international",
  timing: "evening",
  clarificationCount: 0,
  searchProfile: {
    activity: "eat" as const,
    products: ["sushi", "japanese_food"],
    locationFeatures: [],
    occasions: ["dinner"],
    vibes: [],
    mobility: "dakar_wide" as const,
    amenities: [],
    dietaryRequirements: [],
    exclusions: { products: [], categories: [], audienceTags: [], dietary: [] }
  }
};

const fallback = await buildUserContext({
  message: "Waar kan ik goed ontbijten?",
  previousContext: previous,
  activeRecommendation: {
    placeName: "Tokyo Jo",
    needs: previous,
    mentionedTopics: ["Tokyo Jo", "sushi", "Japans restaurant"]
  },
  subcategoryTaxonomy: [
    { name: "breakfast", intent: "food" },
    { name: "sushi", intent: "food" }
  ]
});

assert.equal(fallback.recommendationAction, "new_search");
assert.equal(fallback.context.requestedSubcategory, "breakfast");
assert.equal(fallback.context.requestedStyle, undefined);
assert.ok(!fallback.context.searchProfile?.products.includes("sushi"));

const chatbotFlow = await readFile(new URL("../src/logic/chatbotFlow.ts", import.meta.url), "utf8");
assert.match(chatbotFlow, /const interpretation = await buildUserContext/);
assert.doesNotMatch(chatbotFlow, /const broadensExistingSearch/);
assert.doesNotMatch(chatbotFlow, /const selectsRegionForExistingSearch/);

console.log("Semantic-first routing and deterministic timeout fallback checks passed.");
