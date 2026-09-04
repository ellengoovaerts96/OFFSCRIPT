import { preferredSocialUrl } from "../src/logic/preferredSocialUrl.js";
import type { Place } from "../src/types/place.js";

const basePlace: Place = {
  id: "social-test",
  name: "Social test",
  country: "Senegal",
  region: "Dakar",
  vibeTags: [],
  offscriptPickLevel: 1,
  offscriptPriority: 0,
  audienceTags: [],
  occasionTags: [],
  amenities: [],
  categories: ["culture"],
  subcategories: [],
  shortDescription: "Bekijk de actuele uitleg op TikTok.",
  bestFor: [],
  notIdealFor: [],
  travellerTypes: [],
  childFriendly: true,
  bestTiming: [],
  closedDays: [],
  reservationNeeded: false,
  instagramUrl: "https://instagram.com/example",
  tiktokUrl: "https://tiktok.com/@example",
  googleMapsUrl: "https://maps.example/place",
  guideAvailable: false,
  guideLanguages: [],
  images: [],
  status: "ready"
};

if (preferredSocialUrl(basePlace) !== basePlace.tiktokUrl) {
  throw new Error("An explicit TikTok instruction must prioritize the TikTok URL.");
}

if (
  preferredSocialUrl({ ...basePlace, shortDescription: "Volg ons voor meer informatie." }) !==
  basePlace.instagramUrl
) {
  throw new Error("Instagram must remain the default when the editorial text does not mention TikTok.");
}

console.log("Social-link checks passed.");
