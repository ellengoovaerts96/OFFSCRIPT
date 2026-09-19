import assert from "node:assert/strict";
import { selectBestPlace } from "../src/logic/selectBestPlace.js";
import type { Place } from "../src/types/place.js";
import type { UserContext } from "../src/types/userContext.js";

const chiktay = {
  id: "chiktay-live-music",
  name: "Chiktay by Prainha",
  country: "Senegal",
  region: "Dakar",
  neighbourhood: "Almadies",
  area: "Corniche des Almadies",
  categories: ["food", "nightlife"],
  subcategories: [{ id: "live-music", name: "live_music", displayOrder: 1, images: [] }],
  shortDescription: "A restaurant-lounge with regular live bands.",
  vibeTags: ["lively"],
  offscriptPickLevel: 2,
  offscriptPriority: 78,
  audienceTags: [],
  occasionTags: ["live_music", "dinner"],
  dietaryTags: [],
  amenities: ["live_music"],
  workFriendly: false,
  bestFor: [],
  notIdealFor: [],
  travellerTypes: [],
  childFriendly: false,
  bestTiming: ["evening"],
  closedDays: [],
  reservationNeeded: false,
  googleMapsUrl: "https://maps.example/chiktay",
  guideAvailable: false,
  guideLanguages: [],
  images: [],
  status: "draft"
} as Place;

const context: UserContext = {
  language: "nl",
  targetRegion: "Almadies",
  intent: "culture",
  timing: "evening",
  requestedSubcategory: "Live music",
  searchProfile: {
    activity: "visit",
    products: ["live_music"],
    locationFeatures: [],
    occasions: ["dinner"],
    vibes: [],
    neighbourhood: "Almadies",
    mobility: "nearby",
    amenities: [],
    dietaryRequirements: [],
    exclusions: { products: [], categories: [], audienceTags: [], dietary: [] }
  }
};

assert.equal(
  selectBestPlace([chiktay], context)?.place.name,
  "Chiktay by Prainha",
  "A concrete live-music match must not be blocked by a broad culture activity label."
);

console.log("Live-music intent regression check passed.");
