import { buildSearchProfile } from "../src/logic/buildSearchProfile.js";
import type { UserContext } from "../src/types/userContext.js";

function profile(message: string, context: Omit<UserContext, "language">) {
  return buildSearchProfile(message, { language: "nl", ...context });
}

const sunsetCocktail = profile(
  "Waar kan ik rustig een cocktail drinken aan het strand bij sunset?",
  {
    intent: "drink",
    requestedSubcategory: "beach",
    timing: "sunset",
    vibe: "calm"
  }
);
if (
  sunsetCocktail.activity !== "drink" ||
  !sunsetCocktail.products.includes("cocktails") ||
  !sunsetCocktail.locationFeatures.includes("beachfront") ||
  !sunsetCocktail.occasions.includes("sunset") ||
  !sunsetCocktail.vibes.includes("calm")
) {
  throw new Error(`Sunset cocktail profile mismatch: ${JSON.stringify(sunsetCocktail)}`);
}

const localFood = profile("Waar kan ik Thiéboudienne eten in Yoff?", {
  intent: "food",
  targetRegion: "Yoff",
  requestedStyle: "local"
});
if (
  localFood.activity !== "eat" ||
  !localFood.products.includes("thiéboudienne") ||
  localFood.neighbourhood !== "Yoff" ||
  localFood.mobility !== "nearby"
) {
  throw new Error(`Local food profile mismatch: ${JSON.stringify(localFood)}`);
}

const noPizza = profile("Ik wil geen pizza, gewoon een chilled drink.", {
  intent: "drink",
  vibe: "calm",
  excludedSubcategories: ["pizza"]
});
if (
  noPizza.activity !== "drink" ||
  noPizza.products.includes("pizza") ||
  !noPizza.exclusions.products.includes("pizza") ||
  !noPizza.vibes.includes("calm")
) {
  throw new Error(`Exclusion profile mismatch: ${JSON.stringify(noPizza)}`);
}

const working = profile("Waar kan ik rustig werken met airco?", {
  intent: "work",
  requestedSubcategory: "working",
  requestedAmenities: ["air_conditioning"],
  vibe: "calm"
});
if (
  working.activity !== "work" ||
  !working.amenities.includes("air_conditioning") ||
  !working.vibes.includes("calm")
) {
  throw new Error(`Working profile mismatch: ${JSON.stringify(working)}`);
}

const firstTurn = profile("Een rustige cocktail aan het strand bij zonsondergang.", {
  intent: "drink",
  requestedSubcategory: "beach",
  timing: "sunset",
  vibe: "calm"
});
const locationFollowUp = buildSearchProfile(
  "in Yoff",
  {
    language: "nl",
    intent: "drink",
    requestedSubcategory: "beach",
    timing: "sunset",
    vibe: "calm",
    targetRegion: "Yoff",
    searchProfile: firstTurn
  },
  firstTurn
);
if (
  locationFollowUp.neighbourhood !== "Yoff" ||
  !locationFollowUp.products.includes("cocktails") ||
  !locationFollowUp.locationFeatures.includes("beachfront") ||
  !locationFollowUp.occasions.includes("sunset") ||
  !locationFollowUp.vibes.includes("calm")
) {
  throw new Error(`Follow-up merge mismatch: ${JSON.stringify(locationFollowUp)}`);
}

const pizzaFirst = profile("Je veux une pizza chic.", {
  intent: "food",
  requestedSubcategory: "pizza",
  budget: "upscale"
});
const correctedDrink = buildSearchProfile(
  "Non, pas de pizza. Je veux simplement boire un verre au calme.",
  {
    language: "fr",
    intent: "drink",
    vibe: "calm",
    excludedSubcategories: ["pizza"],
    searchProfile: pizzaFirst
  },
  pizzaFirst
);
if (
  correctedDrink.activity !== "drink" ||
  correctedDrink.products.includes("pizza") ||
  !correctedDrink.exclusions.products.includes("pizza") ||
  !correctedDrink.occasions.includes("drinks") ||
  !correctedDrink.vibes.includes("calm")
) {
  throw new Error(`French correction mismatch: ${JSON.stringify(correctedDrink)}`);
}

const separatedSignals = profile(
  "I want cocktails on a rooftop at sunset, lively but no tourists.",
  { intent: "drink", timing: "sunset", vibe: "lively", avoidAudienceTags: ["tourists"] }
);
if (
  !separatedSignals.products.includes("cocktails") ||
  !separatedSignals.locationFeatures.includes("rooftop") ||
  !separatedSignals.occasions.includes("sunset") ||
  !separatedSignals.vibes.includes("lively") ||
  !separatedSignals.exclusions.audienceTags.includes("tourists")
) {
  throw new Error(`Independent signal mismatch: ${JSON.stringify(separatedSignals)}`);
}

console.log("SearchProfile checks passed.");
