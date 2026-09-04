import { inferRequestedSubcategory } from "../src/ai/buildUserContext.js";
import { detectIntent } from "../src/ai/detectIntent.js";
import { normalizeActivityIntent } from "../src/logic/activityIntent.js";
import { buildSearchProfile } from "../src/logic/buildSearchProfile.js";
import { needsClarification } from "../src/logic/needsClarification.js";
import type { UserContext } from "../src/types/userContext.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const equivalentRunningRequests = [
  "Where is the best place for jogging?",
  "I just want to run!",
  "Waar kan ik hardlopen?",
  "Ik wil joggen",
  "Où est-ce que je peux courir ?",
  "Je cherche un parcours de course à pied"
];

for (const message of equivalentRunningRequests) {
  const normalized = normalizeActivityIntent(message);
  assert(normalized?.focus === "running", `Running was not normalized for: ${message}`);
  assert(normalized.recommendationType === "route", `Running must be a route search: ${message}`);
  assert(detectIntent(message) === "sports", `Running must retain sports intent: ${message}`);
  assert(inferRequestedSubcategory(message) === "running", `Running focus was lost for: ${message}`);
}

const runningContext: UserContext = {
  language: "en",
  currentLocation: "Ngor",
  intent: "sports",
  requestedSubcategory: "running",
  directRequest: true
};
runningContext.searchProfile = buildSearchProfile(
  "Where is the best place for jogging?",
  runningContext
);

assert(runningContext.searchProfile.recommendationType === "route", "Jogging must produce a route search profile.");
assert(
  needsClarification(runningContext, []) === null,
  "A known running intent and location must not trigger another clarification question."
);

const activityCases = [
  ["I want to go for a walk", "walking", "route"],
  ["Je veux faire du vélo", "cycling", "route"],
  ["Ik zoek een fotowandeling", "photography walk", "route"],
  ["Where can I swim?", "swimming", "activity"],
  ["Je veux surfer", "surfing", "activity"]
] as const;

for (const [message, focus, recommendationType] of activityCases) {
  const normalized = normalizeActivityIntent(message);
  assert(normalized?.focus === focus, `Activity focus mismatch for: ${message}`);
  assert(normalized.recommendationType === recommendationType, `Recommendation type mismatch for: ${message}`);
}

console.log("Activity intent checks passed.");
