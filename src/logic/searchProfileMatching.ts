import type { Place } from "../types/place.js";
import type { SearchActivity, SearchProfile } from "../types/searchProfile.js";

const ACTIVITY_INTENTS: Partial<Record<SearchActivity, string[]>> = {
  eat: ["food", "restaurant", "lunch", "dinner"],
  drink: ["drink", "bar", "cocktail", "coffee", "cafe"],
  shop: ["shopping", "shop", "market"],
  surf: ["surfing", "surf", "sports"],
  work: ["working", "work", "coworking"],
  dance: ["nightlife", "dancing", "dance"],
  visit: ["culture", "nature", "visit"],
  relax: ["beach", "relax", "swimming", "beauty", "wellness", "spa", "massage", "nails"],
  sports: ["sports"],
  stay: ["stay"],
  guide: ["guide"],
  reservation: []
};

const TERM_ALIASES: Record<string, string[]> = {
  cocktails: ["cocktail", "cocktails"],
  coffee: ["coffee", "cafe", "café", "koffie"],
  japanese_food: ["japanese", "japonais", "japans", "sushi"],
  senegalese_food: [
    "senegalese",
    "senegalese food",
    "local food",
    "local experience",
    "thiéboudienne",
    "thieboudienne",
    "yassa",
    "mafé",
    "mafe"
  ],
  seafood: ["seafood", "fish", "poisson", "vis", "fruits de mer"],
  thieboudienne: ["thiéboudienne", "thieboudienne", "thiebou dienne", "ceebu jen"],
  jewellery: ["jewellery", "jewelry", "bijoux", "juwelen", "sieraden"],
  beachfront: ["beach", "beachfront", "oceanfront", "ocean", "sea", "oceaan", "zee", "plage", "strand", "bord de mer"],
  ocean_view: [
    "ocean view", "sea view", "oceanfront", "ocean", "sea", "coast", "coastal",
    "bay", "beach", "oceaan", "zee", "kust", "baai", "strand",
    "vue mer", "bord de mer", "cote", "baie", "plage", "uitzicht op zee"
  ],
  rooftop: ["rooftop", "roof terrace", "dakterras", "toit terrasse"],
  indoor: ["indoor", "inside", "interior", "binnen", "intérieur"],
  calm: ["calm", "quiet", "chill", "relaxed", "rustig", "calme", "tranquil", "tranquille"],
  lively: ["lively", "animated", "gezellig", "levendig", "animé", "ambiance"],
  rasta_reggae: ["rasta", "reggae", "rasta reggae"],
  local: ["local", "authentic", "lokaal", "authentiek", "authentique"],
  international: ["international", "cosmopolitan", "internationaal"],
  drinks: ["drink", "drinks", "cocktail", "bar"],
  working: ["working", "work friendly", "remote work", "coworking", "laptop"]
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliases(value: string): string[] {
  return [...new Set([value, ...(TERM_ALIASES[normalize(value).replaceAll(" ", "_")] ?? [])])]
    .map(normalize)
    .filter(Boolean);
}

function placeSearchValues(place: Place): string[] {
  return [
    place.name,
    place.region,
    place.neighbourhood,
    place.area,
    place.vibe,
    place.shortDescription,
    place.practicalInfo,
    place.personalTip,
    place.story,
    place.transport,
    ...place.categories,
    ...place.subcategories.flatMap((subcategory) => [
      subcategory.id,
      subcategory.name,
      subcategory.description
    ]),
    ...place.vibeTags,
    ...place.audienceTags,
    ...place.occasionTags,
    ...place.amenities,
    ...place.bestFor,
    ...place.notIdealFor,
    ...place.travellerTypes,
    ...place.bestTiming
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalize);
}

function placeServesCoffee(place: Place): boolean {
  const coffeeTerms = TERM_ALIASES.coffee.map(normalize);
  const containsCoffee = (value: string | undefined) => {
    if (!value) return false;
    const normalizedValue = normalize(value);
    return coffeeTerms.some((term) => normalizedValue.includes(term));
  };
  const hospitalityCategories = new Set([
    "food_and_drink",
    "food",
    "restaurant",
    "cafe",
    "bar"
  ]);
  // A retail category alone must not exclude a real counter or café. Some
  // local businesses sell products as well as serving coffee. Require explicit
  // service evidence before allowing such a mixed-category place.
  const isRetailPlace = place.categories.some(
    (category) => normalize(category) === "shopping"
  );
  const hasExplicitCoffeeService =
    /\b(cafe|coffee)\b/.test(normalize(place.name)) ||
    place.subcategories.some((subcategory) =>
      /\b(cafe|coffee|takeaway|take away|breakfast)\b/.test(normalize(subcategory.name))
    ) ||
    place.occasionTags.some((tag) =>
      /\b(cafe|coffee|takeaway|take away|breakfast)\b/.test(normalize(tag))
    );
  if (isRetailPlace && !hasExplicitCoffeeService) return false;
  const isHospitalityPlace =
    place.categories.some((category) => hospitalityCategories.has(normalize(category).replaceAll(" ", "_"))) ||
    place.subcategories.some((subcategory) =>
      ["coffee", "cafe", "bar", "breakfast"].some((type) => normalize(subcategory.name).includes(type))
    );
  const hasDocumentedCoffeeService =
    containsCoffee(place.name) ||
    containsCoffee(place.shortDescription) ||
    place.bestFor.some(containsCoffee) ||
    place.subcategories.some((subcategory) =>
      containsCoffee(subcategory.name) || containsCoffee(subcategory.description)
    ) ||
    place.occasionTags.some(containsCoffee);

  return isHospitalityPlace && Boolean(hasDocumentedCoffeeService);
}

const LOCAL_STAPLES = new Set(["thieboudienne", "thiebou dienne", "ceebu jen", "yassa", "mafe"]);

export function searchTermMatchStrength(place: Place, term: string): number {
  if (normalize(term) === "coffee") return placeServesCoffee(place) ? 1 : 0;
  const terms = aliases(term);
  const values = placeSearchValues(place);
  const directMatch = values.some((value) =>
    terms.some((candidate) => value.includes(candidate))
  );
  if (directMatch) return LOCAL_STAPLES.has(normalize(term)) ? 3 : 1;

  // These national dishes are represented unevenly in older place rows. A
  // curated "Senegalese food" classification is sufficient evidence for a
  // local staple search; otherwise every neighbourhood incorrectly appears
  // to have no thiéboudienne, yassa or mafé.
  if (LOCAL_STAPLES.has(normalize(term))) {
    const localCuisineMatch = aliases("senegalese_food").some((candidate) =>
      values.some((value) => value.includes(candidate))
    );
    return localCuisineMatch ? 1 : 0;
  }

  return 0;
}

export function placeMatchesSearchTerm(place: Place, term: string): boolean {
  return searchTermMatchStrength(place, term) > 0;
}

export function placeMatchesSearchActivity(
  place: Place,
  activity: SearchActivity | undefined
): boolean {
  if (!activity || activity === "unknown") return true;
  if (activity === "work" && place.workFriendly) return true;
  const activityTerms = ACTIVITY_INTENTS[activity] ?? [];
  if (!activityTerms.length) return true;
  return activityTerms.some((term) => placeMatchesSearchTerm(place, term));
}

export function placePassesSearchProfileHardConstraints(
  place: Place,
  profile: SearchProfile | undefined
): boolean {
  if (!profile) return true;

  const hasDocumentedPlantBasedOption = profile.dietaryRequirements.some(
    (requirement) =>
      ["vegetarian", "vegan"].includes(normalize(requirement)) &&
      placeMatchesSearchTerm(place, requirement)
  );
  const appliesAsRestaurantWideExclusion = (term: string) =>
    !hasDocumentedPlantBasedOption ||
    !["meat", "fish", "seafood"].includes(normalize(term));

  if (!placeMatchesSearchActivity(place, profile.activity)) return false;
  // Concrete requested products are promises, not soft ranking hints. If the
  // traveller asks for coffee, sushi or cocktails, never fall back to a place
  // that merely matches the broad activity (for example any place to drink).
  if (profile.products.some((term) => !placeMatchesSearchTerm(place, term))) return false;
  if (profile.exclusions.products.some(
    (term) => appliesAsRestaurantWideExclusion(term) && placeMatchesSearchTerm(place, term)
  )) return false;
  if (
    profile.exclusions.categories.some((term) =>
      place.categories.some((category) => normalize(category) === normalize(term))
    )
  ) return false;
  if (
    profile.exclusions.audienceTags.some((tag) =>
      place.audienceTags.some((candidate) => normalize(candidate) === normalize(tag))
    )
  ) return false;
  if (profile.exclusions.dietary.some(
    (term) => appliesAsRestaurantWideExclusion(term) && placeMatchesSearchTerm(place, term)
  )) return false;
  if (profile.amenities.some((amenity) => !place.amenities.includes(amenity as Place["amenities"][number]))) {
    return false;
  }

  return true;
}

function narrowWhenDataSupports(
  places: Place[],
  requirements: string[],
  matches: (place: Place, requirement: string) => boolean
): Place[] {
  if (!requirements.length) return places;
  const exactMatches = places.filter((place) =>
    requirements.every((requirement) => matches(place, requirement))
  );
  return exactMatches.length ? exactMatches : places;
}

export function narrowCandidatesBySearchProfile(
  places: Place[],
  profile: SearchProfile | undefined
): Place[] {
  if (!profile) return places;

  const productCandidates = narrowWhenDataSupports(
    places,
    profile.products,
    placeMatchesSearchTerm
  );

  // Location features, occasions and vibes are genuinely soft preferences.
  // They may add ranking points below, but must never remove a relevant place
  // before editorial priority is evaluated. Older or partly curated rows can
  // legitimately miss a structured `ocean_view`, `sunset` or `calm` tag.
  return productCandidates;
}

function countMatches(place: Place, values: string[]): number {
  return values.filter((value) => placeMatchesSearchTerm(place, value)).length;
}

function sumProductMatchStrength(place: Place, products: string[]): number {
  return products.reduce(
    (total, product) => total + searchTermMatchStrength(place, product),
    0
  );
}

const OCCASION_MATCH_ALIASES: Record<string, string[]> = {
  drinks: ["drinks", "drink", "bar", "cocktail", "cocktails", "sunset drink", "after work drink"],
  sunset: ["sunset", "sunset drink", "sundowner"],
  dinner: ["dinner", "evening", "tonight"],
  lunch: ["lunch", "afternoon"],
  breakfast: ["breakfast", "brunch"],
  nightlife: ["nightlife", "night out", "party", "dancing"],
  working: ["working", "work friendly", "remote work"]
};

export function countStructuredOccasionMatches(place: Place, occasions: string[]): number {
  const structuredValues = [
    ...place.occasionTags,
    ...place.vibeTags,
    ...place.categories,
    ...place.subcategories.map((subcategory) => subcategory.name),
    place.vibe
  ].filter((value): value is string => Boolean(value)).map(normalize);

  return occasions.filter((occasion) => {
    const normalizedOccasion = normalize(occasion);
    const aliases = (OCCASION_MATCH_ALIASES[normalizedOccasion] ?? [normalizedOccasion]).map(normalize);
    return structuredValues.some((value) =>
      aliases.some((alias) => value === alias || value.includes(alias))
    );
  }).length;
}

function budgetScore(place: Place, budget: string | undefined): number {
  if (!budget || place.priceLevel === undefined) return 0;
  if (budget === "budget") return place.priceLevel === 1 ? 30 : place.priceLevel === 2 ? 10 : -20;
  if (budget === "affordable") return place.priceLevel === 2 ? 25 : place.priceLevel === 1 ? 10 : -20;
  if (budget === "mid-range") return place.priceLevel === 3 ? 25 : -10;
  if (budget === "upscale") return place.priceLevel === 4 ? 25 : place.priceLevel === 3 ? 10 : place.priceLevel === 5 ? 5 : -20;
  if (budget === "luxury") return place.priceLevel === 5 ? 30 : place.priceLevel === 4 ? 20 : -20;
  return 0;
}

export function scoreSearchProfilePreferences(
  place: Place,
  profile: SearchProfile | undefined
): number {
  if (!profile) return 0;

  let score = 0;
  // A named product or dish is one of the clearest user signals. An exact
  // database match must be recommendation-ready even when older rows do not
  // yet have complete occasion, timing or editorial metadata.
  score += Math.min(sumProductMatchStrength(place, profile.products) * 30, 60);
  score += Math.min(countMatches(place, profile.locationFeatures) * 15, 30);
  score += Math.min(countMatches(place, profile.occasions) * 12, 24);
  score += Math.min(countMatches(place, profile.vibes) * 12, 24);
  score += Math.min(countMatches(place, profile.dietaryRequirements) * 15, 30);
  score += Math.min(countMatches(place, profile.amenities) * 10, 20);
  score += budgetScore(place, profile.budget);

  if (
    profile.neighbourhood &&
    [place.neighbourhood, place.area, place.region]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalize(value).includes(normalize(profile.neighbourhood as string)))
  ) {
    score += 25;
  }
  if (profile.travellerType && place.travellerTypes.includes(profile.travellerType)) score += 8;
  if (profile.hasChildren && place.childFriendly) score += 12;

  return score;
}
