import type { SearchActivity, SearchProfile } from "../types/searchProfile.js";
import type { UserContext, UserIntent } from "../types/userContext.js";
import { normalizeRegion } from "../utils/normalizeRegion.js";
import { hydrateSearchProfile } from "./searchProfileCompatibility.js";

type SignalPattern = [value: string, pattern: RegExp];

export type SearchProfileSignals = {
  activity?: SearchActivity;
  products: string[];
  locationFeatures: string[];
  occasions: string[];
  vibes: string[];
  exclusions: SearchProfile["exclusions"];
};

const PRODUCT_PATTERNS: SignalPattern[] = [
  ["pizza", /\b(pizza|pizzeria)\b/],
  ["thiéboudienne", /\b(thieboudienne|thiebou dienne|ceebu jen|thieboudiene)\b/],
  ["yassa", /\byassa\b/],
  ["mafé", /\bmafe\b/],
  ["japanese_food", /\b(japanese|japans|japonais|japanisch|sushi)\b/],
  ["senegalese_food", /\b(senegalese food|senegalese dishes|senegalese cuisine|senegalees eten|lokale gerechten|plats senegalais|cuisine senegalaise)\b/],
  ["seafood", /\b(seafood|fish|vis|poisson|fruits de mer)\b/],
  ["cocktails", /\b(cocktail|cocktails)\b/],
  ["coffee", /\b(coffee|koffie|cafe|kaffee)\b/],
  ["jewellery", /\b(jewellery|jewelry|juwelen|sieraden|bijoux)\b/]
];

const LOCATION_FEATURE_PATTERNS: SignalPattern[] = [
  ["beachfront", /\b(beach|strand|plage|beachfront|oceanfront|oceaan|ocean|zee|sea|bord de mer)\b/],
  ["ocean_view", /\b(ocean view|sea view|uitzicht op zee|vue mer|vue sur l ocean)\b/],
  ["rooftop", /\b(rooftop|dakterras|toit terrasse|terrasse sur le toit)\b/],
  ["garden", /\b(garden|tuin|jardin)\b/],
  ["indoor", /\b(inside|indoor|binnen|interieur|a l interieur)\b/]
];

const OCCASION_PATTERNS: SignalPattern[] = [
  ["breakfast", /\b(breakfast|ontbijt|petit dejeuner|fruhstuck)\b/],
  ["lunch", /\b(lunch|middageten|dejeuner|mittagessen)\b/],
  ["dinner", /\b(dinner|diner|avondeten|ce soir|vanavond|abendessen)\b/],
  ["sunset", /\b(sunset|zonsondergang|coucher du soleil|sonnenuntergang)\b/],
  ["drinks", /\b(drinks?|iets drinken|boire un verre|verre|aperitif|apero)\b/],
  ["nightlife", /\b(nightlife|uitgaan|sortir|party|feest|soiree)\b/],
  ["working", /\b(work|working|remote work|cowork|coworking|laptop|werken|telewerken|travailler|teletravail)\b/],
  ["date", /\b(date night|romantic date|romantische date|rendez vous romantique)\b/],
  ["family_outing", /\b(family outing|met het gezin|sortie en famille)\b/]
];

const VIBE_PATTERNS: SignalPattern[] = [
  ["rasta_reggae", /\b(rasta|reggae|rastabar)\b/],
  ["calm", /\b(calm|quiet|chill|chilled|relaxed|rustig|tranquil|tranquille|calme|ruhig)\b/],
  ["lively", /\b(lively|gezellig|levendig|anime|ambiance|lebendig)\b/],
  ["romantic", /\b(romantic|romantisch|romantique)\b/],
  ["local", /\b(local|lokaal|lokale|authentic|authentiek|authentique)\b/],
  ["international", /\b(international|internationaal|cosmopolitan|cosmopolitain)\b/]
];

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function mergeUnique(previous: string[], current: string[]): string[] {
  return unique([...previous, ...current]);
}

const ANIMAL_PRODUCT_EXCLUSIONS = new Set(["meat", "fish", "seafood"]);

function dietaryOptionExclusions(
  exclusions: SearchProfile["exclusions"],
  dietaryRequirements: string[]
): SearchProfile["exclusions"] {
  const requestsPlantBasedOption = dietaryRequirements.some((requirement) =>
    ["vegetarian", "vegan"].includes(normalizeText(requirement))
  );
  if (!requestsPlantBasedOption) return exclusions;

  // A vegetarian guest needs a suitable dish; the restaurant itself does not
  // need to be meat- or seafood-free. Applying these terms to all place text
  // incorrectly removes mixed-menu restaurants with documented veg options.
  return {
    ...exclusions,
    products: exclusions.products.filter(
      (term) => !ANIMAL_PRODUCT_EXCLUSIONS.has(normalizeText(term))
    ),
    dietary: exclusions.dietary.filter(
      (term) => !ANIMAL_PRODUCT_EXCLUSIONS.has(normalizeText(term))
    )
  };
}

function supportedSemanticProducts(
  deterministicProducts: string[],
  semanticProducts: string[]
): string[] {
  const explicitProducts = new Set(deterministicProducts.map(normalizeText));

  return semanticProducts.flatMap((product) => {
    const normalizedProduct = normalizeText(product);

    // A generic request to have a drink is not automatically a cocktail
    // request. Products are used as hard candidate filters, so accepting this
    // inference could remove bars such as Chez Iso before editorial priority
    // is evaluated.
    if (normalizedProduct === "cocktails" && !explicitProducts.has("cocktails")) {
      return [];
    }

    // Keep singular/plural variants from becoming two simultaneous hard
    // requirements in candidate narrowing.
    if (normalizedProduct === "cocktail") {
      return explicitProducts.has("cocktails") ? ["cocktails"] : [];
    }

    return [product];
  });
}

function supportedSemanticLocationFeatures(features: string[]): string[] {
  const occasions = new Set([
    "breakfast", "lunch", "dinner", "drinks", "sunrise", "sunset", "nightlife"
  ]);
  return features.filter((feature) => !occasions.has(normalizeText(feature)));
}

function supportedSemanticVibes(vibes: string[]): string[] {
  const budgetDescriptors = new Set([
    "affordable", "budget", "budget friendly", "cheap",
    "mid range", "midrange", "average",
    "chic", "upscale", "high end",
    "luxury", "luxurious", "luxe"
  ]);
  return vibes.filter((vibe) => !budgetDescriptors.has(normalizeText(vibe)));
}

function isNegatedMatch(text: string, index: number): boolean {
  const prefix = text.slice(Math.max(0, index - 55), index);
  return /\b(geen|niet|zonder|no|not|without|don t want|do not want|pas de|pas|sans|ne veux pas|kein|keine|ohne)\b(?:\s+\w+){0,3}\s*$/i.test(
    prefix
  );
}

function extractPositivePatterns(message: string, patterns: SignalPattern[]): string[] {
  const text = normalizeText(message);
  const values: string[] = [];

  for (const [value, pattern] of patterns) {
    const match = pattern.exec(text);
    if (match && !isNegatedMatch(text, match.index)) values.push(value);
  }

  return unique(values);
}

function extractNegatedPatterns(message: string, patterns: SignalPattern[]): string[] {
  const text = normalizeText(message);
  const values: string[] = [];

  for (const [value, pattern] of patterns) {
    const match = pattern.exec(text);
    if (match && isNegatedMatch(text, match.index)) values.push(value);
  }

  return unique(values);
}

function activityFromIntent(intent?: UserIntent): SearchActivity | undefined {
  const byIntent: Partial<Record<UserIntent, SearchActivity>> = {
    food: "eat",
    drink: "drink",
    shopping: "shop",
    wellness: "relax",
    other: "unknown",
    culture: "visit",
    beach: "relax",
    nature: "visit",
    nightlife: "dance",
    sports: "sports",
    work: "work",
    stay: "stay",
    guide: "guide",
    reservation: "reservation",
    unknown: "unknown"
  };
  return intent ? byIntent[intent] : undefined;
}

export function recognizeActivity(message: string, context: UserContext): SearchActivity | undefined {
  const text = normalizeText(message);
  if (/\b(surf|surfing|surfen|surfer)\b/.test(text)) return "surf";
  if (/\b(work|working|cowork|laptop|werken|travailler|teletravail)\b/.test(text)) return "work";
  if (/\b(shop|shopping|buy|kopen|winkelen|acheter|boutique)\b/.test(text)) return "shop";
  if (/\b(dance|dancing|party|dansen|uitgaan|danser|sortir)\b/.test(text)) return "dance";
  if (/\b(drink|drinks|cocktail|bar|drinken|boire|verre)\b/.test(text)) return "drink";
  if (/\b(eat|food|restaurant|lunch|dinner|pizza|eten|manger|dejeuner|diner)\b/.test(text)) return "eat";
  if (/\b(relax|chill|swim|beach|ontspannen|zwemmen|plage|nager)\b/.test(text)) return "relax";
  if (/\b(sport|sports|fitness|gym|running|yoga|pilates)\b/.test(text)) return "sports";
  if (/\b(spa|wellness|massage|nails|manicure|pedicure)\b/.test(text)) return "relax";
  if (/\b(visit|culture|museum|art|bezoeken|cultuur|visiter|culture)\b/.test(text)) return "visit";
  return activityFromIntent(context.intent);
}

export function recognizeProducts(message: string, context: UserContext): string[] {
  const products = extractPositivePatterns(message, PRODUCT_PATTERNS);
  const subcategory = normalizeText(context.requestedSubcategory ?? "");
  const nonProducts = new Set([
    "beach", "working", "surfing", "swimming", "running", "yoga",
    "fitness", "walking", "dancing", "excursion"
  ]);
  if (subcategory && !nonProducts.has(subcategory)) products.push(subcategory.replaceAll(" ", "_"));
  return unique(products);
}

export function recognizeLocationFeatures(message: string, context: UserContext): string[] {
  const features = extractPositivePatterns(message, LOCATION_FEATURE_PATTERNS);
  if (normalizeText(context.requestedSubcategory ?? "") === "beach") features.push("beachfront");
  return unique(features);
}

export function recognizeOccasions(message: string, context: UserContext): string[] {
  const occasions = extractPositivePatterns(message, OCCASION_PATTERNS);
  const timing = normalizeText(context.timing ?? "");
  if (["morning", "breakfast"].includes(timing)) occasions.push("breakfast");
  if (["lunch", "afternoon"].includes(timing)) occasions.push("lunch");
  if (["evening", "tonight", "dinner"].includes(timing)) occasions.push("dinner");
  if (timing === "sunset") occasions.push("sunset");
  if (context.travellerType === "family" || context.hasChildren) occasions.push("family_outing");
  return unique(occasions);
}

export function recognizeVibes(message: string, context: UserContext): string[] {
  return unique([
    ...extractPositivePatterns(message, VIBE_PATTERNS),
    context.vibe,
    context.requestedStyle
  ]);
}

export function recognizeExclusions(message: string, context: UserContext): SearchProfile["exclusions"] {
  const normalized = normalizeText(message);
  const dietary = unique([
    ...(context.dietaryExclusions ?? []),
    ...extractNegatedPatterns(message, PRODUCT_PATTERNS).filter((value) => value === "seafood"),
    /\b(no|not|geen|niet|zonder|sans|pas de)\b.{0,30}\b(meat|vlees|viande)\b/.test(normalized)
      ? "meat"
      : undefined
  ]);

  return {
    products: unique([
      ...(context.excludedSubcategories ?? []),
      ...extractNegatedPatterns(message, PRODUCT_PATTERNS)
    ]),
    categories: unique(context.excludedCategories ?? []),
    audienceTags: unique([
      ...(context.avoidAudienceTags ?? []),
      /\b(no|without|geen|zonder|sans|pas de)\b.{0,35}\b(tourists|toeristen|touristes)\b/.test(normalized)
        ? "tourists"
        : undefined
    ]),
    dietary
  };
}

export function recognizeSearchProfileSignals(
  message: string,
  context: UserContext
): SearchProfileSignals {
  return {
    activity: recognizeActivity(message, context),
    products: recognizeProducts(message, context),
    locationFeatures: recognizeLocationFeatures(message, context),
    occasions: recognizeOccasions(message, context),
    vibes: recognizeVibes(message, context),
    exclusions: recognizeExclusions(message, context)
  };
}

function hasExplicitActivity(message: string): boolean {
  const neutralContext: UserContext = { language: "unknown" };
  return recognizeActivity(message, neutralContext) !== undefined;
}

function withoutExcluded(values: string[], exclusions: string[]): string[] {
  const blocked = new Set(exclusions.map(normalizeText));
  return values.filter((value) => !blocked.has(normalizeText(value)));
}

export function buildSearchProfile(
  message: string,
  context: UserContext,
  previousProfile: SearchProfile | null | undefined = context.searchProfile,
  semanticSignals?: Partial<SearchProfileSignals> | null
): SearchProfile {
  const compatiblePreviousProfile = hydrateSearchProfile(previousProfile, context);
  const deterministicSignals = recognizeSearchProfileSignals(message, context);
  const signals: SearchProfileSignals = {
    activity: semanticSignals?.activity ?? deterministicSignals.activity,
    products: mergeUnique(
      deterministicSignals.products,
      supportedSemanticProducts(
        deterministicSignals.products,
        semanticSignals?.products ?? []
      )
    ),
    locationFeatures: mergeUnique(
      deterministicSignals.locationFeatures,
      supportedSemanticLocationFeatures(semanticSignals?.locationFeatures ?? [])
    ),
    occasions: mergeUnique(deterministicSignals.occasions, semanticSignals?.occasions ?? []),
    vibes: mergeUnique(
      deterministicSignals.vibes,
      supportedSemanticVibes(semanticSignals?.vibes ?? [])
    ),
    exclusions: {
      products: mergeUnique(
        deterministicSignals.exclusions.products,
        semanticSignals?.exclusions?.products ?? []
      ),
      categories: mergeUnique(
        deterministicSignals.exclusions.categories,
        semanticSignals?.exclusions?.categories ?? []
      ),
      audienceTags: mergeUnique(
        deterministicSignals.exclusions.audienceTags,
        semanticSignals?.exclusions?.audienceTags ?? []
      ),
      dietary: mergeUnique(
        deterministicSignals.exclusions.dietary,
        semanticSignals?.exclusions?.dietary ?? []
      )
    }
  };
  const changedActivity =
    hasExplicitActivity(message) &&
    compatiblePreviousProfile.activity !== undefined &&
    signals.activity !== compatiblePreviousProfile.activity;
  const baseProducts = changedActivity ? [] : compatiblePreviousProfile.products;
  const baseLocationFeatures = changedActivity ? [] : compatiblePreviousProfile.locationFeatures;
  const baseOccasions = changedActivity ? [] : compatiblePreviousProfile.occasions;
  const baseVibes = changedActivity ? [] : compatiblePreviousProfile.vibes;
  const rawExclusions = {
    products: mergeUnique(compatiblePreviousProfile.exclusions.products, signals.exclusions.products),
    categories: mergeUnique(compatiblePreviousProfile.exclusions.categories, signals.exclusions.categories),
    audienceTags: mergeUnique(compatiblePreviousProfile.exclusions.audienceTags, signals.exclusions.audienceTags),
    dietary: mergeUnique(compatiblePreviousProfile.exclusions.dietary, signals.exclusions.dietary)
  };
  const targetLocation = normalizeRegion(context.targetRegion ?? context.currentLocation);
  const neighbourhood =
    targetLocation && targetLocation !== "Dakar"
      ? targetLocation
      : compatiblePreviousProfile.neighbourhood;
  const dietaryRequirements = unique([
    ...compatiblePreviousProfile.dietaryRequirements,
    ...(["vegan", "vegetarian"].includes(normalizeText(context.requestedSubcategory ?? ""))
      ? [normalizeText(context.requestedSubcategory ?? "")]
      : [])
  ]);
  const exclusions = dietaryOptionExclusions(rawExclusions, dietaryRequirements);

  return {
    activity: signals.activity ?? compatiblePreviousProfile.activity,
    products: withoutExcluded(
      mergeUnique(baseProducts, signals.products),
      [...exclusions.products, ...exclusions.dietary]
    ),
    locationFeatures: mergeUnique(baseLocationFeatures, signals.locationFeatures),
    occasions: mergeUnique(baseOccasions, signals.occasions),
    vibes: mergeUnique(baseVibes, signals.vibes),
    neighbourhood,
    mobility: targetLocation === "Dakar"
      ? "dakar_wide"
      : neighbourhood
        ? "nearby"
        : compatiblePreviousProfile.mobility,
    budget: context.budget ?? (changedActivity ? undefined : compatiblePreviousProfile.budget),
    amenities: mergeUnique(compatiblePreviousProfile.amenities, context.requestedAmenities ?? []),
    dietaryRequirements,
    exclusions,
    travellerType: context.travellerType ?? compatiblePreviousProfile.travellerType,
    hasChildren: context.hasChildren ?? compatiblePreviousProfile.hasChildren
  };
}
