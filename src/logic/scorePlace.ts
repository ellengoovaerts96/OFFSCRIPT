import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { normalizeRegion } from "../utils/normalizeRegion.js";

const INTENT_CATEGORY_ALIASES: Record<string, string[]> = {
  food: ["food", "restaurant", "restaurants", "lunch", "dinner", "brunch", "breakfast", "cafe", "café", "seafood", "grill", "pizza", "pizzeria", "eat", "eating"],
  drink: ["drink", "bar", "cocktail", "cocktails", "drinks", "cafe", "café"],
  culture: ["culture", "market", "museum", "craft", "crafts"],
  shopping: ["shopping", "shop", "market", "craft", "crafts"],
  sports: ["sports", "sport", "fitness", "gym", "workout", "training", "surf", "surfing", "yoga", "running"],
  beach: ["beach", "sea", "ocean"],
  nightlife: ["nightlife", "club", "dance", "bar"]
};

const TIMING_ALIASES: Record<string, string[]> = {
  tonight: ["tonight", "evening", "night"],
  evening: ["evening", "tonight", "night", "sunset"],
  sunset: ["sunset", "evening"],
  lunch: ["lunch", "noon", "midday", "day", "afternoon"],
  afternoon: ["afternoon", "day", "lunch", "noon", "midday"],
  morning: ["morning"]
};

const SHOPPING_FOCUS_ALIASES: Record<string, string[]> = {
  handbags: ["handbags", "bag", "bags", "handtas", "handtassen", "tas", "tassen", "sac", "sacs"],
  jewellery: ["jewellery", "jewelry", "jewels", "sieraden", "juwelen", "bijoux"],
  wood: ["wood", "woodwork", "wooden", "hout", "houtwerk", "bois"],
  artworks: ["artworks", "artwork", "art", "kunst", "kunstwerken", "oeuvres", "œuvres"]
};

const VIBE_ALIASES: Record<string, string[]> = {
  romantic: ["romantic", "romantisch", "romantique", "date", "couple", "sunset", "intimate"],
  pizza: ["pizza", "pizzeria"],
  local: ["local", "lokaal", "locale", "lokal", "authentic", "authentiek", "authentique"],
  calm: ["calm", "quiet", "rustig", "calme", "ruhig", "relax", "relaxed"],
  lively: ["lively", "gezellig", "levendig", "ambiance", "anime", "animé", "nightlife"],
  scenic: ["scenic", "sunset", "view", "uitzicht", "vue", "sea", "ocean"],
  fitness: ["fitness", "gym", "workout", "training"],
  surfing: ["surfing", "surf", "surf school"],
  yoga: ["yoga"],
  running: ["running", "run"]
};

const STRUCTURED_ONLY_VIBES = new Set(["fitness", "surfing", "yoga", "running"]);

function normalizeValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesAny(value: string, candidates: string[]): boolean {
  const normalizedValue = normalizeValue(value);
  return candidates.map(normalizeValue).some((candidate) => normalizedValue === candidate || normalizedValue.includes(candidate));
}

function textMatchesLocation(value: string | undefined, targetLocation: string): boolean {
  if (!value) return false;

  const normalizedValue = normalizeValue(normalizeRegion(value) ?? value);
  const normalizedTarget = normalizeValue(normalizeRegion(targetLocation) ?? targetLocation);

  return normalizedValue === normalizedTarget || normalizedValue.includes(normalizedTarget);
}

export function placeMatchesLocation(place: Place, targetLocation: string | undefined): boolean {
  if (!targetLocation) return false;

  return (
    textMatchesLocation(place.region, targetLocation) ||
    textMatchesLocation(place.neighbourhood, targetLocation) ||
    textMatchesLocation(place.exactArea, targetLocation)
  );
}

export function placeMatchesIntent(place: Place, intent: string): boolean {
  const aliases = INTENT_CATEGORY_ALIASES[intent] ?? [intent];

  return (
    place.categories.some((category) => matchesAny(category, aliases)) ||
    place.subcategories.some((subcategory) => textIncludesAny(subcategory.name, aliases)) ||
    place.bestFor.some((value) => textIncludesAny(value, aliases)) ||
    textIncludesAny(place.vibe, aliases)
  );
}

function placeMatchesTiming(place: Place, timing: string): boolean {
  const aliases = TIMING_ALIASES[timing] ?? [timing];
  return place.bestTiming.some((candidate) => matchesAny(candidate, aliases));
}

function textIncludesAny(value: string | undefined, candidates: string[]): boolean {
  if (!value) return false;
  const normalizedValue = normalizeValue(value);
  return candidates.map(normalizeValue).some((candidate) => normalizedValue.includes(candidate));
}

function placeMatchesShoppingFocus(place: Place, focus: string | undefined): boolean {
  if (!focus) return false;

  const normalizedFocus = normalizeValue(focus);
  const aliases = SHOPPING_FOCUS_ALIASES[normalizedFocus] ?? [normalizedFocus];

  return (
    place.subcategories.some((subcategory) => matchesAny(subcategory.name, aliases)) ||
    place.bestFor.some((value) => textIncludesAny(value, aliases)) ||
    textIncludesAny(place.shortDescription, aliases) ||
    textIncludesAny(place.practicalInfo, aliases) ||
    textIncludesAny(place.personalTip, aliases)
  );
}

function placeMatchesVibe(place: Place, vibe: string | undefined): boolean {
  if (!vibe) return false;

  const normalizedVibe = normalizeValue(vibe);
  const aliases = VIBE_ALIASES[normalizedVibe] ?? [normalizedVibe];
  const structuredMatch = placeMatchesSpecificFocus(place, vibe);

  if (STRUCTURED_ONLY_VIBES.has(normalizedVibe)) return structuredMatch;

  return (
    structuredMatch ||
    textIncludesAny(place.shortDescription, aliases) ||
    textIncludesAny(place.practicalInfo, aliases) ||
    textIncludesAny(place.personalTip, aliases) ||
    textIncludesAny(place.transport, aliases)
  );
}

export function placeMatchesSpecificFocus(place: Place, focus: string | undefined): boolean {
  if (!focus) return false;

  const normalizedFocus = normalizeValue(focus);
  const aliases = VIBE_ALIASES[normalizedFocus] ?? [normalizedFocus];

  return (
    textIncludesAny(place.name, aliases) ||
    textIncludesAny(place.exactArea, aliases) ||
    place.bestFor.some((value) => textIncludesAny(value, aliases)) ||
    place.categories.some((category) => matchesAny(category, aliases)) ||
    place.subcategories.some((subcategory) => textIncludesAny(subcategory.name, aliases)) ||
    textIncludesAny(place.vibe, aliases)
  );
}

export function isSpecificFocus(focus: string | undefined): boolean {
  return Boolean(focus && STRUCTURED_ONLY_VIBES.has(normalizeValue(focus)));
}

export function scorePlace(place: Place, context: UserContext): number {
  let score = 0;

  const targetRegion = normalizeRegion(context.targetRegion ?? context.currentLocation);

  if (placeMatchesLocation(place, targetRegion)) score += 40;
  if (context.intent && context.intent !== "unknown" && placeMatchesIntent(place, context.intent)) {
    score += 30;
  }
  if (context.intent === "shopping" && placeMatchesShoppingFocus(place, context.vibe)) score += 25;
  if (placeMatchesVibe(place, context.vibe)) score += isSpecificFocus(context.vibe) ? 35 : 25;
  if (context.timing && placeMatchesTiming(place, context.timing)) score += 15;
  if (context.travellerType && place.travellerTypes.includes(context.travellerType)) score += 10;
  if (context.hasChildren === true && place.childFriendly) score += 10;
  if (context.hasChildren === true && !place.childFriendly) score -= 50;
  if (place.status === "premium") score += 10;
  if (place.status === "archived") score -= 100;

  return score;
}
