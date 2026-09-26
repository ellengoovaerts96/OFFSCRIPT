import { inferRequestedSubcategory } from "../src/ai/buildUserContext.js";
import { detectIntent } from "../src/ai/detectIntent.js";
import { normalizeActivityIntent } from "../src/logic/activityIntent.js";
import { buildSearchProfile } from "../src/logic/buildSearchProfile.js";
import { needsClarification } from "../src/logic/needsClarification.js";
import { placePassesSearchProfileHardConstraints } from "../src/logic/searchProfileMatching.js";
import type { Place } from "../src/types/place.js";
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

assert(detectIntent("Waar kan ik vandaag sporten?") === "sports", "Dutch generic sporten must be sports intent.");

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

const staleSeafoodSportsProfile = buildSearchProfile(
  "Waar kan ik vandaag sporten?",
  { language: "nl", intent: "sports", directRequest: true },
  undefined,
  {
    activity: "sports",
    products: ["seafood"],
    locationFeatures: [],
    occasions: [],
    vibes: [],
    exclusions: { products: [], categories: [], audienceTags: [], dietary: [] }
  }
);
const beachRestaurant = {
  id: "ideal-beach",
  name: "Ideal Beach",
  country: "Senegal",
  region: "Dakar",
  categories: ["Food & Drink", "Beach"],
  subcategories: [{ id: "seafood", name: "Fish & Seafood", displayOrder: 1, images: [] }],
  shortDescription: "Drinks, seafood and dinner on an oceanfront terrace.",
  vibeTags: [], audienceTags: [], occasionTags: [], dietaryTags: [], amenities: ["ocean_view"],
  bestFor: [], notIdealFor: [], travellerTypes: [], childFriendly: false, bestTiming: [], closedDays: [],
  reservationNeeded: false, googleMapsUrl: "https://maps.example.test", guideAvailable: false,
  guideLanguages: [], images: [], status: "ready", offscriptPickLevel: 1, offscriptPriority: 60
} as Place;
assert(
  !placePassesSearchProfileHardConstraints(beachRestaurant, staleSeafoodSportsProfile),
  "A stale food product must never make a venue without documented sport pass a sports search."
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

const eveningSurfProfile = buildSearchProfile(
  "Waar kan ik vanavond surfen?",
  { language: "nl", intent: "sports", requestedSubcategory: "surfing", timing: "tonight" },
  undefined,
  {
    activity: "eat",
    products: [],
    locationFeatures: [],
    occasions: ["dinner"],
    vibes: [],
    exclusions: { products: [], categories: [], audienceTags: [], dietary: [] }
  }
);
assert(eveningSurfProfile.activity === "surf", "Surfing must override an AI dinner interpretation of 'vanavond'.");
assert(eveningSurfProfile.recommendationType === "activity", "An evening surf request must remain an activity search.");
assert(
  !placePassesSearchProfileHardConstraints(beachRestaurant, eveningSurfProfile),
  "A beachfront cafe must never pass as a surf recommendation merely because the request says 'vanavond'."
);
const surfSchool = {
  ...beachRestaurant,
  id: "surf-school",
  name: "Dakar Surf School",
  categories: ["sports"],
  subcategories: [{ id: "surf-lessons", name: "Surf lessons", displayOrder: 1, images: [] }],
  shortDescription: "Surf lessons and board rental with local instructors."
} as Place;
assert(
  placePassesSearchProfileHardConstraints(surfSchool, eveningSurfProfile),
  "A documented surf school must remain eligible for the same request."
);

console.log("Activity intent checks passed.");
