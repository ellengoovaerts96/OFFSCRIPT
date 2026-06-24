import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { normalizeRegion } from "../utils/normalizeRegion.js";

const INTENT_CATEGORY_ALIASES: Record<string, string[]> = {
  food: ["food", "restaurant", "lunch", "dinner", "brunch", "local food", "local"],
  drink: ["drink", "bar", "cocktail", "drinks"],
  culture: ["culture", "market", "museum", "craft", "crafts"],
  shopping: ["shopping", "shop", "market", "craft", "crafts"],
  sports: ["sports", "sport"],
  beach: ["beach", "sea", "ocean"],
  nightlife: ["nightlife", "club", "dance", "bar"]
};

const TIMING_ALIASES: Record<string, string[]> = {
  tonight: ["tonight", "evening", "night"],
  evening: ["evening", "tonight", "night", "sunset"],
  sunset: ["sunset", "evening"],
  lunch: ["lunch", "day", "afternoon"],
  afternoon: ["afternoon", "day", "lunch"],
  morning: ["morning"]
};

const SHOPPING_FOCUS_ALIASES: Record<string, string[]> = {
  handbags: ["handbags", "bag", "bags", "handtas", "handtassen", "tas", "tassen", "sac", "sacs"],
  jewellery: ["jewellery", "jewelry", "jewels", "sieraden", "juwelen", "bijoux"],
  wood: ["wood", "woodwork", "wooden", "hout", "houtwerk", "bois"],
  artworks: ["artworks", "artwork", "art", "kunst", "kunstwerken", "oeuvres", "œuvres"]
};

function normalizeValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesAny(value: string, candidates: string[]): boolean {
  const normalizedValue = normalizeValue(value);
  return candidates.map(normalizeValue).includes(normalizedValue);
}

function placeMatchesIntent(place: Place, intent: string): boolean {
  const aliases = INTENT_CATEGORY_ALIASES[intent] ?? [intent];
  return place.categories.some((category) => matchesAny(category, aliases));
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
    textIncludesAny(place.longDescription, aliases) ||
    textIncludesAny(place.personalTip, aliases)
  );
}

export function scorePlace(place: Place, context: UserContext): number {
  let score = 0;

  const targetRegion = normalizeRegion(context.targetRegion ?? context.currentLocation);
  const placeRegion = normalizeRegion(place.region);
  const placeNeighbourhood = normalizeRegion(place.neighbourhood);

  if (targetRegion && (placeRegion === targetRegion || placeNeighbourhood === targetRegion)) score += 40;
  if (context.intent && context.intent !== "unknown" && placeMatchesIntent(place, context.intent)) {
    score += 30;
  }
  if (context.intent === "shopping" && placeMatchesShoppingFocus(place, context.vibe)) score += 25;
  if (context.timing && placeMatchesTiming(place, context.timing)) score += 15;
  if (context.travellerType && place.travellerTypes.includes(context.travellerType)) score += 10;
  if (context.hasChildren === true && place.childFriendly) score += 10;
  if (context.hasChildren === true && !place.childFriendly) score -= 50;
  if (place.status === "premium") score += 10;
  if (place.status === "archived") score -= 100;

  return score;
}
