import { buildSearchProfile } from "../src/logic/buildSearchProfile.js";
import { hydrateSearchProfile } from "../src/logic/searchProfileCompatibility.js";
import {
  placePassesSearchProfileHardConstraints,
  placeSupportsDirectArtistPurchase,
} from "../src/logic/searchProfileMatching.js";
import {
  compatibleAmenities,
  compatibleAudienceTags,
  compatibleCategories,
  compatibleTravellerTypes
} from "../src/logic/placeCompatibility.js";
import type { UserContext } from "../src/types/userContext.js";
import type { Place } from "../src/types/place.js";

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

const genericSunsetDrink = buildSearchProfile(
  "Waar kan ik chill iets drinken met zicht op de oceaan bij zonsondergang?",
  {
    language: "nl",
    intent: "drink",
    timing: "sunset",
    vibe: "calm"
  },
  undefined,
  {
    activity: "drink",
    products: ["cocktails"],
    locationFeatures: ["ocean_view"],
    occasions: ["sunset", "drinks"],
    vibes: ["calm"],
    exclusions: {
      products: [],
      categories: [],
      audienceTags: [],
      dietary: []
    }
  }
);
if (
  genericSunsetDrink.products.includes("cocktails") ||
  !genericSunsetDrink.locationFeatures.includes("ocean_view") ||
  !genericSunsetDrink.occasions.includes("sunset") ||
  !genericSunsetDrink.vibes.includes("calm")
) {
  throw new Error(
    `Generic sunset drink became an over-specific product: ${JSON.stringify(genericSunsetDrink)}`
  );
}

const directArtistProfile = profile(
  "Ik zou graag van de kunstenaar zelf kunnen kopen",
  { intent: "shopping", requestedSubcategory: "artworks" }
);
if (!directArtistProfile.products.includes("direct_from_artist")) {
  throw new Error(`Direct artist purchase was not retained as a hard product: ${JSON.stringify(directArtistProfile)}`);
}
const artPlace = (name: string, shortDescription: string): Place => ({
  id: name.toLowerCase().replaceAll(" ", "-"), name, country: "Senegal", region: "Dakar",
  categories: ["culture"], subcategories: [{ id: "gallery", name: "Art Gallery", displayOrder: 1, images: [] }],
  shortDescription, vibeTags: [], audienceTags: [], occasionTags: [], dietaryTags: [], amenities: [],
  bestFor: [], notIdealFor: [], travellerTypes: [], childFriendly: true, bestTiming: [], closedDays: [],
  reservationNeeded: false, googleMapsUrl: "https://maps.example.test", guideAvailable: false,
  guideLanguages: [], images: [], status: "ready", offscriptPickLevel: 3, offscriptPriority: 95
});
const villageDesArts = artPlace(
  "Village des Arts",
  "Enter the studios and talk with the artists. If you find a work you like, buy it directly from the artist."
);
const genericGallery = artPlace("Loman Art House", "Local and international artists exhibit and create here.");
if (
  !placeSupportsDirectArtistPurchase(villageDesArts) ||
  !placePassesSearchProfileHardConstraints(villageDesArts, directArtistProfile) ||
  placePassesSearchProfileHardConstraints(genericGallery, directArtistProfile)
) {
  throw new Error("Only places that explicitly document direct artist purchases may satisfy this request.");
}

const vegetarianDinner = buildSearchProfile(
  "Je veux dîner mais je suis végétarien.",
  {
    language: "fr",
    intent: "food",
    timing: "dinner",
    requestedSubcategory: "vegetarian"
  },
  undefined,
  {
    activity: "eat",
    products: ["vegetarian"],
    locationFeatures: [],
    occasions: ["dinner"],
    vibes: [],
    exclusions: {
      products: ["meat", "fish", "seafood"],
      categories: [],
      audienceTags: [],
      dietary: ["meat", "fish", "seafood"]
    }
  }
);
if (
  !vegetarianDinner.dietaryRequirements.includes("vegetarian") ||
  vegetarianDinner.exclusions.products.some((term) => ["meat", "fish", "seafood"].includes(term)) ||
  vegetarianDinner.exclusions.dietary.some((term) => ["meat", "fish", "seafood"].includes(term))
) {
  throw new Error(
    `Vegetarian preference became a restaurant-wide animal-product exclusion: ${JSON.stringify(vegetarianDinner)}`
  );
}

const explicitSunsetCocktail = buildSearchProfile(
  "Waar kan ik een cocktail drinken met zicht op de oceaan bij zonsondergang?",
  {
    language: "nl",
    intent: "drink",
    timing: "sunset",
    vibe: "calm"
  },
  undefined,
  {
    activity: "drink",
    products: ["cocktails"],
    locationFeatures: ["ocean_view"],
    occasions: ["sunset", "drinks"],
    vibes: ["calm"],
    exclusions: {
      products: [],
      categories: [],
      audienceTags: [],
      dietary: []
    }
  }
);
if (!explicitSunsetCocktail.products.includes("cocktails")) {
  throw new Error(
    `Explicit cocktail product was removed: ${JSON.stringify(explicitSunsetCocktail)}`
  );
}

const chicCocktailAlternative = buildSearchProfile(
  "En een chic alternatief?",
  {
    language: "nl",
    intent: "drink",
    timing: "sunset",
    budget: "upscale",
    requestedSubcategory: "Cocktails",
    vibe: "scenic"
  },
  {
    activity: "drink",
    products: ["cocktails"],
    locationFeatures: [],
    occasions: ["sunset"],
    vibes: ["scenic"],
    mobility: "dakar_wide",
    budget: "mid-range",
    amenities: [],
    dietaryRequirements: [],
    exclusions: {
      products: [],
      categories: [],
      audienceTags: [],
      dietary: []
    }
  },
  {
    activity: "drink",
    products: ["cocktail"],
    locationFeatures: ["sunset"],
    occasions: ["sunset"],
    vibes: ["chic"],
    exclusions: {
      products: [],
      categories: [],
      audienceTags: [],
      dietary: []
    }
  }
);
if (
  chicCocktailAlternative.budget !== "upscale" ||
  chicCocktailAlternative.products.join(",") !== "cocktails" ||
  chicCocktailAlternative.locationFeatures.includes("sunset") ||
  chicCocktailAlternative.vibes.includes("chic") ||
  !chicCocktailAlternative.vibes.includes("scenic") ||
  !chicCocktailAlternative.occasions.includes("sunset")
) {
  throw new Error(
    `Chic alternative leaked across search dimensions: ${JSON.stringify(chicCocktailAlternative)}`
  );
}

const localFood = profile("Waar kan ik Thiéboudienne eten in Yoff?", {
  intent: "food",
  targetRegion: "Yoff",
  requestedStyle: "local"
});
if (
  localFood.activity !== "eat" ||
  !localFood.products.includes("thieboudienne") ||
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

const legacyContext: UserContext = {
  language: "fr",
  intent: "food",
  targetRegion: "Yoff",
  requestedSubcategory: "pizza",
  requestedStyle: "international",
  requestedAmenities: ["wifi"],
  vibe: "calm",
  excludedSubcategories: ["seafood"],
  clarificationCount: 2
};
const hydratedLegacyConversation = hydrateSearchProfile(undefined, legacyContext);
if (
  hydratedLegacyConversation.activity !== "eat" ||
  !hydratedLegacyConversation.products.includes("pizza") ||
  hydratedLegacyConversation.neighbourhood !== "Yoff" ||
  !hydratedLegacyConversation.vibes.includes("calm") ||
  !hydratedLegacyConversation.amenities.includes("wifi") ||
  !hydratedLegacyConversation.exclusions.products.includes("seafood")
) {
  throw new Error(
    `Legacy conversation hydration mismatch: ${JSON.stringify(hydratedLegacyConversation)}`
  );
}

const partialLegacyProfile = hydrateSearchProfile(
  {
    activity: "food",
    products: "pizza",
    exclusions: { products: ["seafood"] }
  },
  { language: "nl" }
);
if (
  partialLegacyProfile.activity !== "eat" ||
  !partialLegacyProfile.products.includes("pizza") ||
  !partialLegacyProfile.exclusions.products.includes("seafood") ||
  partialLegacyProfile.occasions.length !== 0 ||
  partialLegacyProfile.exclusions.categories.length !== 0
) {
  throw new Error(`Partial profile compatibility mismatch: ${JSON.stringify(partialLegacyProfile)}`);
}

const legacyCategories = compatibleCategories(["Food and Drink", "Sport"]);
if (!legacyCategories.includes("food") || !legacyCategories.includes("bar") || !legacyCategories.includes("sports")) {
  throw new Error(`Legacy category compatibility mismatch: ${JSON.stringify(legacyCategories)}`);
}
const legacyAudience = compatibleAudienceTags([
  "locals",
  "African expats",
  "international_expats",
  "tourists"
]);
if (
  legacyAudience.join(",") !== "residents,expats,tourists"
) {
  throw new Error(`Legacy audience compatibility mismatch: ${JSON.stringify(legacyAudience)}`);
}
const legacyTravellers = compatibleTravellerTypes([
  "Solo traveller",
  "Couples",
  "residents",
  "Families"
]);
if (legacyTravellers.join(",") !== "solo,couple,family") {
  throw new Error(`Legacy traveller compatibility mismatch: ${JSON.stringify(legacyTravellers)}`);
}
const legacyAmenities = compatibleAmenities([], [
  "Quiet tables inside, with air conditioning, Wi-Fi and power outlets."
]);
if (
  !legacyAmenities.includes("air_conditioning") ||
  !legacyAmenities.includes("wifi") ||
  !legacyAmenities.includes("power_outlets") ||
  !legacyAmenities.includes("indoor_seating")
) {
  throw new Error(`Legacy amenity compatibility mismatch: ${JSON.stringify(legacyAmenities)}`);
}

console.log("SearchProfile checks passed.");
