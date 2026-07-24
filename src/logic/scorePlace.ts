import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { normalizeRegion } from "../utils/normalizeRegion.js";
import { vibeTagAliases } from "./vibeTags.js";

const INTENT_CATEGORY_ALIASES: Record<string, string[]> = {
  food: ["food", "restaurant", "restaurants", "lunch", "dinner", "brunch", "breakfast", "cafe", "café", "seafood", "grill", "pizza", "pizzeria", "eat", "eating"],
  drink: ["drink", "bar", "cocktail", "cocktails", "drinks", "cafe", "café"],
  culture: ["culture", "market", "museum", "art", "artist", "artists", "artwork", "artworks", "gallery", "galerie", "atelier", "craft", "crafts", "artisanat", "artisanal"],
  shopping: ["shopping", "shop", "market", "buying art", "art", "artist", "artists", "artwork", "artworks", "gallery", "galerie", "atelier", "craft", "crafts", "artisanat", "artisanal"],
  work: ["working", "work_friendly", "remote_work", "coworking", "laptop"],
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
  rasta_reggae: vibeTagAliases("rasta_reggae"),
  romantic: ["romantic", "romantisch", "romantique", "date", "couple", "sunset", "intimate"],
  quick_casual: ["quick", "casual", "informal", "fast", "takeaway", "snelle", "informeel", "rapide", "décontracté"],
  italian_restaurant: ["italian", "italian restaurant", "italiaans", "restaurant italien", "italienisch"],
  local: ["local", "lokaal", "locale", "lokal", "authentic", "authentiek", "authentique"],
  calm: ["calm", "quiet", "rustig", "calme", "ruhig", "relax", "relaxed"],
  lively: ["lively", "gezellig", "levendig", "ambiance", "anime", "animé", "nightlife"],
  scenic: ["scenic", "sunset", "view", "uitzicht", "vue", "sea", "ocean"],
  fitness: ["fitness", "gym", "workout", "training"],
  surfing: ["surfing", "surf", "surf school"],
  yoga: ["yoga"],
  running: ["running", "run"],
  swimming: ["swimming", "swim", "pool", "natation", "nager", "zwemmen"],
  artworks: ["artworks", "artwork", "art", "artist", "artists", "gallery", "galerie", "atelier", "craft", "crafts", "artisanat", "artisanal"]
};

const STYLE_ALIASES: Record<string, string[]> = {
  local: ["local", "lokaal", "locale", "authentic", "authentiek", "authentique", "traditional", "traditioneel", "traditionnel"],
  international: ["international", "internationaal", "cosmopolitan", "cosmopolitain", "world cuisine", "fusion"]
};

const BUDGET_ALIASES: Record<string, string[]> = {
  affordable: ["affordable", "cheap", "budget", "inexpensive", "betaalbaar", "goedkoop", "abordable", "pas cher", "€", "$"],
  "mid-range": ["mid-range", "midrange", "average", "gemiddeld", "moyen", "€€", "$$"],
  upscale: ["upscale", "luxury", "luxurious", "chic", "luxe", "haut de gamme", "exclusief", "€€€", "$$$"]
};

const OCCASION_ALIASES: Record<string, string[]> = {
  drinks: ["drink", "drinks", "bar", "cocktail", "cocktails", "chill_drinks"],
  lunch: ["lunch", "noon", "midday", "afternoon"],
  dinner: ["dinner", "evening", "tonight"],
  nightlife: ["nightlife", "night_out", "dancing", "dance"],
  live_music: ["live_music", "live music", "concert", "music"],
  beach_day: ["beach_day", "beach", "sea", "ocean"],
  sunset: ["sunset", "sundowner"],
  family_outing: ["family_outing", "family", "families", "kids", "children"],
  date_night: ["date_night", "date", "romantic", "couple"],
  working: ["working", "work_friendly", "remote_work", "laptop"],
  watching_sports: ["watching_sports", "sports", "match", "football"],
  budget_friendly: ["budget_friendly", "budget", "affordable", "cheap"],
  local_experience: ["local_experience", "local", "authentic"]
};

const STRUCTURED_ONLY_VIBES = new Set(["fitness", "surfing", "yoga", "running", "rasta_reggae"]);

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
    textMatchesLocation(place.area, targetLocation)
  );
}

export function placeMatchesIntent(place: Place, intent: string): boolean {
  const aliases = INTENT_CATEGORY_ALIASES[intent] ?? [intent];

  return (
    (intent === "work" && place.workFriendly === true) ||
    place.categories.some((category) => matchesAny(category, aliases)) ||
    place.subcategories.some((subcategory) => textIncludesAny(subcategory.name, aliases)) ||
    place.occasionTags.some((tag) => matchesAny(tag, aliases)) ||
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
  if (normalizedFocus === "working" && place.workFriendly === true) return true;
  const aliases = VIBE_ALIASES[normalizedFocus] ?? [normalizedFocus];
  const structuredMatch = (
    textIncludesAny(place.name, aliases) ||
    textIncludesAny(place.area, aliases) ||
    place.bestFor.some((value) => textIncludesAny(value, aliases)) ||
    place.categories.some((category) => matchesAny(category, aliases)) ||
    place.subcategories.some((subcategory) => textIncludesAny(subcategory.name, aliases)) ||
    place.occasionTags.some((tag) => matchesAny(tag, aliases)) ||
    place.vibeTags.some((tag) => matchesAny(tag, [normalizedFocus])) ||
    textIncludesAny(place.vibe, aliases)
  );

  if (STRUCTURED_ONLY_VIBES.has(normalizedFocus)) return structuredMatch;

  return (
    structuredMatch ||
    textIncludesAny(place.shortDescription, aliases) ||
    textIncludesAny(place.practicalInfo, aliases) ||
    textIncludesAny(place.personalTip, aliases) ||
    textIncludesAny(place.transport, aliases)
  );
}

function placeMatchesPreference(place: Place, preference: string | undefined, aliasesByPreference: Record<string, string[]>): boolean {
  if (!preference) return false;
  const aliases = aliasesByPreference[normalizeValue(preference)] ?? [preference];
  return (
    place.subcategories.some((subcategory) => textIncludesAny(subcategory.name, aliases)) ||
    place.bestFor.some((value) => textIncludesAny(value, aliases)) ||
    textIncludesAny(place.vibe, aliases) ||
    textIncludesAny(place.shortDescription, aliases) ||
    textIncludesAny(place.practicalInfo, aliases) ||
    textIncludesAny(place.personalTip, aliases) ||
    textIncludesAny(place.priceLevel?.toString(), aliases)
  );
}

function requestedOccasions(context: UserContext): string[] {
  const occasions = new Set<string>();
  const normalizedTiming = normalizeValue(context.timing ?? "");
  const normalizedVibe = normalizeValue(context.vibe ?? "");
  const normalizedSubcategory = normalizeValue(context.requestedSubcategory ?? "");

  if (context.intent === "drink") occasions.add("drinks");
  if (context.intent === "nightlife") occasions.add("nightlife");
  if (context.intent === "beach") occasions.add("beach_day");
  if (context.intent === "sports") occasions.add("watching_sports");
  if (context.intent === "food" && ["lunch", "afternoon"].includes(normalizedTiming)) occasions.add("lunch");
  if (context.intent === "food" && ["tonight", "evening"].includes(normalizedTiming)) occasions.add("dinner");
  if (normalizedTiming === "sunset") occasions.add("sunset");
  if (context.travellerType === "family" || context.hasChildren) occasions.add("family_outing");
  if (context.travellerType === "couple" && normalizedVibe === "romantic") occasions.add("date_night");
  if (context.budget === "affordable") occasions.add("budget_friendly");
  if (context.requestedStyle === "local") occasions.add("local_experience");

  for (const [occasion, aliases] of Object.entries(OCCASION_ALIASES)) {
    if (
      aliases.some((alias) => matchesAny(normalizedVibe, [alias])) ||
      aliases.some((alias) => matchesAny(normalizedSubcategory, [alias]))
    ) {
      occasions.add(occasion);
    }
  }

  return [...occasions];
}

function occasionMatchCount(place: Place, context: UserContext): number {
  return requestedOccasions(context).filter((occasion) => {
    const aliases = OCCASION_ALIASES[occasion] ?? [occasion];
    return place.occasionTags.some((tag) => matchesAny(tag, aliases));
  }).length;
}

export function isSpecificFocus(focus: string | undefined): boolean {
  return Boolean(focus && STRUCTURED_ONLY_VIBES.has(normalizeValue(focus)));
}

export function scorePlace(place: Place, context: UserContext): number {
  let score = 0;

  const targetRegion = normalizeRegion(context.targetRegion ?? context.currentLocation);
  const matchesRequestedFocus = Boolean(
    context.requestedSubcategory &&
    placeMatchesSpecificFocus(place, context.requestedSubcategory)
  );

  if (placeMatchesLocation(place, targetRegion)) score += 40;
  if (
    context.intent &&
    context.intent !== "unknown" &&
    (placeMatchesIntent(place, context.intent) || matchesRequestedFocus)
  ) {
    score += 30;
  }
  if (context.intent === "shopping" && placeMatchesShoppingFocus(place, context.vibe)) score += 25;
  if (matchesRequestedFocus) score += 35;
  if (placeMatchesPreference(place, context.requestedStyle, STYLE_ALIASES)) score += 20;
  if (placeMatchesPreference(place, context.budget, BUDGET_ALIASES)) score += 20;
  if (context.budget === "affordable" && place.priceLevel !== undefined) score += place.priceLevel <= 2 ? 20 : -10;
  if (context.budget === "mid-range" && place.priceLevel !== undefined) score += place.priceLevel === 3 ? 20 : 0;
  if (context.budget === "upscale" && place.priceLevel !== undefined) score += place.priceLevel >= 4 ? 20 : -5;
  if (placeMatchesVibe(place, context.vibe)) score += isSpecificFocus(context.vibe) ? 35 : 25;
  if (context.timing && placeMatchesTiming(place, context.timing)) score += 15;
  if (context.travellerType && place.travellerTypes.includes(context.travellerType)) score += 10;
  if (context.hasChildren === true && place.childFriendly) score += 10;
  if (context.hasChildren === true && !place.childFriendly) score -= 50;
  score += Math.min(
    (context.requestedAmenities ?? []).filter((amenity) => (place.amenities ?? []).includes(amenity as Place["amenities"][number])).length * 15,
    30
  );
  // Occasion tags express why someone would go there. They refine a valid
  // category/location match without overriding exclusions or safety filters.
  score += Math.min(occasionMatchCount(place, context) * 15, 30);
  // Editorial judgement breaks ties after the factual intent match. A high
  // priority can never compensate for an irrelevant category or hard safety
  // mismatch because those are filtered/scored separately.
  score += place.offscriptPickLevel * 6;
  score += Math.round(place.offscriptPriority / 5);
  if (context.requestedStyle === "local" && place.foodOrientation !== undefined) {
    score += Math.max(-10, -place.foodOrientation * 5);
  }
  if (context.requestedStyle === "international" && place.foodOrientation !== undefined) {
    score += Math.max(-10, place.foodOrientation * 5);
  }
  if (place.status === "premium") score += 10;
  if (place.status === "archived") score -= 100;

  return score;
}
