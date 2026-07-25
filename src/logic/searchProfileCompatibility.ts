import type {
  SearchActivity,
  SearchMobility,
  SearchProfile
} from "../types/searchProfile.js";
import type { UserContext, UserIntent } from "../types/userContext.js";
import { normalizeRegion } from "../utils/normalizeRegion.js";

const ACTIVITIES = new Set<SearchActivity>([
  "eat",
  "drink",
  "shop",
  "surf",
  "work",
  "dance",
  "visit",
  "relax",
  "sports",
  "stay",
  "guide",
  "reservation",
  "unknown"
]);

const LEGACY_ACTIVITY_ALIASES: Record<string, SearchActivity> = {
  food: "eat",
  bar: "drink",
  shopping: "shop",
  wellness: "relax",
  other: "unknown",
  nightlife: "dance",
  culture: "visit",
  beach: "relax"
};

const INTENT_ACTIVITIES: Partial<Record<UserIntent, SearchActivity>> = {
  food: "eat",
  drink: "drink",
  shopping: "shop",
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

const NON_PRODUCT_SUBCATEGORIES = new Set([
  "beach",
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

function normalized(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function stringArray(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return [...new Set(
    values
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function activity(value: unknown, intent?: UserIntent): SearchActivity | undefined {
  if (typeof value === "string") {
    const candidate = normalized(value);
    if (ACTIVITIES.has(candidate as SearchActivity)) return candidate as SearchActivity;
    if (LEGACY_ACTIVITY_ALIASES[candidate]) return LEGACY_ACTIVITY_ALIASES[candidate];
  }
  return intent ? INTENT_ACTIVITIES[intent] : undefined;
}

function mobility(value: unknown): SearchMobility | undefined {
  if (value === "nearby" || value === "dakar_wide") return value;
  return undefined;
}

function legacyOccasions(context: UserContext): string[] {
  const timing = normalized(context.timing ?? "");
  if (["morning", "breakfast"].includes(timing)) return ["breakfast"];
  if (["lunch", "afternoon"].includes(timing)) return ["lunch"];
  if (["evening", "tonight", "dinner"].includes(timing)) return ["dinner"];
  if (timing === "sunset") return ["sunset"];
  return [];
}

/**
 * Accepts profiles written by earlier deployments (including partial JSON)
 * and fills missing signals from the original conversation_context columns.
 * This lets conversations continue across deployments without rewriting rows.
 */
export function hydrateSearchProfile(
  value: unknown,
  context: UserContext
): SearchProfile {
  const profile = record(value);
  const exclusions = record(profile.exclusions);
  const requestedSubcategory = normalized(context.requestedSubcategory ?? "");
  const targetLocation = normalizeRegion(context.targetRegion ?? context.currentLocation);
  const storedNeighbourhood =
    typeof profile.neighbourhood === "string" && profile.neighbourhood.trim()
      ? profile.neighbourhood.trim()
      : undefined;
  const neighbourhood =
    targetLocation && targetLocation !== "Dakar"
      ? targetLocation
      : storedNeighbourhood;
  const products = stringArray(profile.products);
  if (
    requestedSubcategory &&
    !NON_PRODUCT_SUBCATEGORIES.has(requestedSubcategory) &&
    !products.some((item) => normalized(item) === requestedSubcategory)
  ) {
    products.push(requestedSubcategory);
  }
  const locationFeatures = stringArray(profile.locationFeatures);
  if (
    requestedSubcategory === "beach" &&
    !locationFeatures.some((item) => normalized(item) === "beachfront")
  ) {
    locationFeatures.push("beachfront");
  }

  return {
    activity: activity(profile.activity, context.intent),
    products,
    locationFeatures,
    occasions: [...new Set([
      ...stringArray(profile.occasions),
      ...legacyOccasions(context)
    ])],
    vibes: [...new Set([
      ...stringArray(profile.vibes),
      ...stringArray(context.vibe),
      ...stringArray(context.requestedStyle)
    ])],
    neighbourhood,
    mobility: targetLocation === "Dakar"
      ? "dakar_wide"
      : neighbourhood
        ? "nearby"
        : mobility(profile.mobility),
    budget: context.budget ??
      (typeof profile.budget === "string" ? profile.budget : undefined),
    amenities: [...new Set([
      ...stringArray(profile.amenities),
      ...(context.requestedAmenities ?? [])
    ])],
    dietaryRequirements: stringArray(profile.dietaryRequirements),
    exclusions: {
      products: [...new Set([
        ...stringArray(exclusions.products),
        ...(context.excludedSubcategories ?? [])
      ])],
      categories: [...new Set([
        ...stringArray(exclusions.categories),
        ...(context.excludedCategories ?? [])
      ])],
      audienceTags: [...new Set([
        ...stringArray(exclusions.audienceTags),
        ...(context.avoidAudienceTags ?? [])
      ])],
      dietary: [...new Set([
        ...stringArray(exclusions.dietary),
        ...(context.dietaryExclusions ?? [])
      ])]
    },
    travellerType: context.travellerType ??
      (typeof profile.travellerType === "string"
        ? profile.travellerType as SearchProfile["travellerType"]
        : undefined),
    hasChildren: context.hasChildren ??
      (typeof profile.hasChildren === "boolean" ? profile.hasChildren : undefined)
  };
}
