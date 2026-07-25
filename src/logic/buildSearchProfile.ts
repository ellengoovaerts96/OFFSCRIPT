import type { SearchActivity, SearchProfile } from "../types/searchProfile.js";
import type { UserContext, UserIntent } from "../types/userContext.js";
import { normalizeRegion } from "../utils/normalizeRegion.js";

const LOCATION_SUBCATEGORIES = new Set(["beach"]);
const ACTIVITY_SUBCATEGORIES = new Set([
  "working",
  "surfing",
  "swimming",
  "running",
  "yoga",
  "fitness",
  "walking",
  "dancing",
  "excursion"
]);

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

function activityFromContext(context: UserContext): SearchActivity | undefined {
  const focus = normalizeText(context.requestedSubcategory ?? "");
  if (focus === "surfing") return "surf";
  if (focus === "working" || context.intent === "work") return "work";
  if (focus === "dancing") return "dance";
  if (focus === "walking" || focus === "excursion") return "visit";

  const byIntent: Partial<Record<UserIntent, SearchActivity>> = {
    food: "eat",
    drink: "drink",
    shopping: "shop",
    culture: "visit",
    beach: "relax",
    nature: "visit",
    nightlife: "dance",
    sports: "sports",
    stay: "stay",
    guide: "guide",
    reservation: "reservation",
    unknown: "unknown"
  };

  return context.intent ? byIntent[context.intent] : undefined;
}

function productsFromMessage(message: string, context: UserContext): string[] {
  const text = normalizeText(message);
  const products: string[] = [];
  const patterns: Array<[string, RegExp]> = [
    ["pizza", /\b(pizza|pizzeria)\b/],
    ["thiéboudienne", /\b(thieboudienne|thiebou dienne)\b/],
    ["yassa", /\byassa\b/],
    ["mafé", /\bmafe\b/],
    ["japanese_food", /\b(japanese|japans|japonais|japanisch)\b/],
    ["seafood", /\b(seafood|vis|poisson|fruits de mer)\b/],
    ["cocktails", /\b(cocktail|cocktails)\b/],
    ["coffee", /\b(coffee|koffie|cafe|kaffee)\b/],
    ["jewellery", /\b(jewellery|jewelry|juwelen|sieraden|bijoux)\b/]
  ];

  for (const [product, pattern] of patterns) {
    if (pattern.test(text)) products.push(product);
  }

  const subcategory = normalizeText(context.requestedSubcategory ?? "");
  if (
    subcategory &&
    !LOCATION_SUBCATEGORIES.has(subcategory) &&
    !ACTIVITY_SUBCATEGORIES.has(subcategory)
  ) {
    products.push(subcategory.replaceAll(" ", "_"));
  }

  return unique(products);
}

function locationFeaturesFromMessage(message: string, context: UserContext): string[] {
  const text = normalizeText(message);
  return unique([
    /\b(beach|strand|plage|beachfront|oceanfront)\b/.test(text) ||
    normalizeText(context.requestedSubcategory ?? "") === "beach"
      ? "beachfront"
      : undefined,
    /\b(ocean view|sea view|uitzicht op zee|vue mer|vue sur l ocean)\b/.test(text)
      ? "ocean_view"
      : undefined,
    /\b(rooftop|dakterras|toit terrasse)\b/.test(text) ? "rooftop" : undefined,
    /\b(garden|tuin|jardin)\b/.test(text) ? "garden" : undefined,
    /\b(inside|indoor|binnen|interieur)\b/.test(text) ? "indoor" : undefined
  ]);
}

function occasionsFromContext(context: UserContext): string[] {
  const timing = normalizeText(context.timing ?? "");
  const occasions: string[] = [];

  if (context.intent === "drink") occasions.push("drinks");
  if (context.intent === "nightlife") occasions.push("nightlife");
  if (context.intent === "work") occasions.push("working");
  if (["morning", "breakfast"].includes(timing)) occasions.push("breakfast");
  if (["lunch", "afternoon"].includes(timing)) occasions.push("lunch");
  if (["evening", "tonight", "dinner"].includes(timing)) occasions.push("dinner");
  if (timing === "sunset") occasions.push("sunset");
  if (context.travellerType === "family" || context.hasChildren) occasions.push("family_outing");

  return unique(occasions);
}

export function buildSearchProfile(message: string, context: UserContext): SearchProfile {
  const targetLocation = normalizeRegion(context.targetRegion ?? context.currentLocation);
  const neighbourhood =
    targetLocation && targetLocation !== "Dakar" ? targetLocation : undefined;
  const excludedProducts = unique(context.excludedSubcategories ?? []);
  const excludedDietary = unique(context.dietaryExclusions ?? []);
  const normalizedExcludedProducts = new Set(
    [...excludedProducts, ...excludedDietary].map(normalizeText)
  );
  const products = productsFromMessage(message, context).filter(
    (product) => !normalizedExcludedProducts.has(normalizeText(product))
  );
  const requestedSubcategory = normalizeText(context.requestedSubcategory ?? "");
  const dietaryRequirements = ["vegan", "vegetarian"].includes(requestedSubcategory)
    ? [requestedSubcategory]
    : [];

  return {
    activity: activityFromContext(context),
    products,
    locationFeatures: locationFeaturesFromMessage(message, context),
    occasions: occasionsFromContext(context),
    vibes: unique([context.vibe, context.requestedStyle]),
    neighbourhood,
    mobility: targetLocation === "Dakar"
      ? "dakar_wide"
      : neighbourhood
        ? "nearby"
        : undefined,
    budget: context.budget,
    amenities: unique(context.requestedAmenities ?? []),
    dietaryRequirements,
    exclusions: {
      products: excludedProducts,
      categories: [...new Set(context.excludedCategories ?? [])],
      audienceTags: unique(context.avoidAudienceTags ?? []),
      dietary: excludedDietary
    },
    travellerType: context.travellerType,
    hasChildren: context.hasChildren
  };
}
