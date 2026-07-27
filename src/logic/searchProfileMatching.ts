import type { Place } from "../types/place.js";
import type { SearchActivity, SearchProfile } from "../types/searchProfile.js";

const ACTIVITY_INTENTS: Partial<Record<SearchActivity, string[]>> = {
  eat: ["food", "restaurant", "lunch", "dinner"],
  drink: ["drink", "bar", "cocktail"],
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
  thiéboudienne: ["thiéboudienne", "thieboudienne", "thiebou dienne", "ceebu jen"],
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

export function placeMatchesSearchTerm(place: Place, term: string): boolean {
  const terms = aliases(term);
  return placeSearchValues(place).some((value) =>
    terms.some((candidate) => value.includes(candidate))
  );
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

  if (!placeMatchesSearchActivity(place, profile.activity)) return false;
  if (profile.exclusions.products.some((term) => placeMatchesSearchTerm(place, term))) return false;
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
  if (profile.exclusions.dietary.some((term) => placeMatchesSearchTerm(place, term))) return false;
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

function narrowWhenAnyDataSupports(
  places: Place[],
  requirements: string[],
  matches: (place: Place, requirement: string) => boolean
): Place[] {
  if (!requirements.length) return places;
  const supportingMatches = places.filter((place) =>
    requirements.some((requirement) => matches(place, requirement))
  );
  return supportingMatches.length ? supportingMatches : places;
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
  // Location features, occasions and vibes are descriptive signals. Legacy
  // rows often express only part of them in structured tags (for example a
  // genuine sunset bar may have ocean and calm data but no explicit sunset
  // tag). Require support for at least one soft signal overall, then let the
  // preference and editorial scores rank the relevant set.
  return narrowWhenAnyDataSupports(
    productCandidates,
    [...profile.locationFeatures, ...profile.occasions, ...profile.vibes],
    placeMatchesSearchTerm
  );
}

function countMatches(place: Place, values: string[]): number {
  return values.filter((value) => placeMatchesSearchTerm(place, value)).length;
}

function budgetScore(place: Place, budget: string | undefined): number {
  if (!budget || place.priceLevel === undefined) return 0;
  if (budget === "budget") return place.priceLevel === 1 ? 30 : place.priceLevel === 2 ? 10 : -20;
  if (budget === "affordable") return place.priceLevel === 2 ? 25 : place.priceLevel === 1 ? 10 : -20;
  if (budget === "mid-range") return place.priceLevel === 3 ? 25 : -10;
  if (budget === "upscale") return place.priceLevel === 4 ? 25 : place.priceLevel === 5 ? 10 : -20;
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
  score += Math.min(countMatches(place, profile.products) * 30, 60);
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
