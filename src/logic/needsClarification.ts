import type { UserContext } from "../types/userContext.js";
import type { Place } from "../types/place.js";
import { normalizeRegion } from "../utils/normalizeRegion.js";
import {
  isSpecificDirectRequest,
  MAX_CLARIFICATION_QUESTIONS,
  recommendationReadiness
} from "./recommendationReadiness.js";
import { findClarificationCandidates } from "./selectBestPlace.js";

export type MissingContextField = "location" | "travellerType" | "children" | "intent" | "subcategory" | "vibe" | "timing" | "budget";

const VIBE_RELEVANT_INTENTS = new Set([
  "food",
]);

const SUBCATEGORY_REQUIRED_INTENTS = new Set([
  "food",
  "drink",
  "culture",
  "beach",
  "sports",
  "nature",
  "nightlife",
  "shopping",
  "work"
]);

function hasSpecificLocation(context: UserContext): boolean {
  const location = normalizeRegion(context.currentLocation ?? context.targetRegion);

  if (!location) return false;
  if (location !== "Dakar") return true;

  return hasActionableMoodOrIntent(context);
}

function hasActionableMoodOrIntent(context: UserContext): boolean {
  return Boolean((context.intent && context.intent !== "unknown") || context.vibe);
}

function canRecommendWithoutTravellerType(context: UserContext): boolean {
  if (isSpecificDirectRequest(context)) return true;

  return Boolean(
    hasSpecificLocation(context) &&
      context.intent &&
      context.intent !== "unknown" &&
      (
        context.timing ||
        context.vibe ||
        context.requestedSubcategory ||
        context.requestedStyle ||
        context.budget
      )
  );
}

function needsVibeForBroadIntent(context: UserContext): boolean {
  return Boolean(
    context.intent &&
      context.intent !== "unknown" &&
      VIBE_RELEVANT_INTENTS.has(context.intent) &&
      !context.vibe &&
      !context.requestedStyle &&
      !context.budget
  );
}

function hasMeaningfulSubcategory(context: UserContext): boolean {
  if (context.intent === "beach") {
    return Boolean(
      (context.requestedSubcategory && context.requestedSubcategory !== "beach") ||
      context.vibe
    );
  }

  if (context.intent === "food" && context.requestedStyle) return true;

  // For work, culture and similar experience-led requests, an explicit mood
  // such as artistic already distinguishes the useful database candidates.
  // Asking for a place type as well adds no value and tempts invented choices.
  if (context.vibe) return true;

  return Boolean(context.requestedSubcategory);
}

function needsSubcategory(context: UserContext): boolean {
  // A meal moment already makes a broad food request actionable. Asking what
  // to eat as well would waste one of the three available questions.
  if (context.intent === "food" && context.timing && context.timing !== "unknown") return false;
  if (context.intent === "drink" && context.timing && context.timing !== "unknown") return false;

  const normalizedSubcategory = context.requestedSubcategory?.trim().toLowerCase();
  if (
    ["coffee", "café", "cafe"].includes(normalizedSubcategory ?? "") &&
    !context.requestedStyle &&
    !(context.searchProfile?.products ?? []).some((product) =>
      /cafe touba|café touba|espresso|cappuccino|latte/i.test(product)
    )
  ) {
    return true;
  }

  return Boolean(
    context.intent &&
    context.intent !== "unknown" &&
    SUBCATEGORY_REQUIRED_INTENTS.has(context.intent) &&
    !hasMeaningfulSubcategory(context)
  );
}

function distinctCount(values: Array<string | number | boolean | undefined>): number {
  return new Set(values.filter((value) => value !== undefined && value !== "")).size;
}

function candidateLocation(place: Place): string | undefined {
  return normalizeRegion(place.neighbourhood ?? place.area ?? place.region);
}

function candidateVibeSignature(place: Place): string {
  return [place.vibe, ...place.vibeTags]
    .filter(Boolean)
    .map((value) => value?.toLowerCase())
    .sort()
    .join("|");
}

function candidateTravellerSignature(place: Place): string {
  return [...place.travellerTypes].sort().join("|");
}

function mostInformativeCandidateField(
  context: UserContext,
  candidates: Place[]
): MissingContextField | null {
  const options: Array<{ field: MissingContextField; score: number }> = [];
  const hasSpecificFocus = Boolean(
    context.requestedSubcategory || context.requestedStyle || context.vibe
  );
  const childSuitabilityVaries = distinctCount(candidates.map((place) => place.childFriendly)) > 1;

  if (!hasSpecificLocation(context)) {
    // Even when all candidates happen to share a neighbourhood, location still
    // determines whether getting there is realistic. Skip it only for a single
    // clear match, handled before this function is called.
    const spansNeighbourhoods = distinctCount(candidates.map(candidateLocation)) > 1;
    options.push({ field: "location", score: spansNeighbourhoods ? 100 : 95 });
  }

  if (
    context.travellerType === "family" &&
    context.hasChildren === undefined &&
    childSuitabilityVaries
  ) {
    options.push({ field: "children", score: 90 });
  }

  if (
    !hasSpecificFocus &&
    (!context.travellerType || context.travellerType === "unknown") &&
    (
      childSuitabilityVaries ||
      distinctCount(candidates.map(candidateTravellerSignature)) > 1
    )
  ) {
    options.push({
      field: "travellerType",
      score: context.intent === "food" ? 80 : childSuitabilityVaries ? 60 : 45
    });
  }

  if (
    !hasSpecificFocus &&
    !context.vibe &&
    !context.requestedStyle &&
    distinctCount(candidates.map(candidateVibeSignature)) > 1
  ) {
    options.push({ field: "vibe", score: 70 });
  }

  return options.sort((left, right) => right.score - left.score)[0]?.field ?? null;
}

export function needsClarification(context: UserContext, places?: Place[]): MissingContextField | null {
  // Start with what the person actually wants. Audience and logistics only
  // become useful after the request itself is understood.
  if (!context.intent || context.intent === "unknown") return "intent";

  if ((context.clarificationCount ?? 0) >= MAX_CLARIFICATION_QUESTIONS) return null;

  if (needsSubcategory(context)) return "subcategory";

  if (places) {
    const candidates = findClarificationCandidates(places, context);

    // Ask location only when it can change the result. Never fabricate area
    // types: the eventual question is a neutral request for the current
    // neighbourhood. A QR-provided accommodation neighbourhood already
    // satisfies this requirement through currentLocation.
    if (
      !hasSpecificLocation(context) &&
      distinctCount(candidates.map(candidateLocation)) > 1
    ) return "location";

    // Once mobility is known, ask only about a field that actually separates
    // the remaining database candidates.
    if (candidates.length <= 1) return null;
    return mostInformativeCandidateField(context, candidates);
  }

  if (isSpecificDirectRequest(context)) return null;

  const readiness = recommendationReadiness(context);
  if (readiness.ready) return null;

  if (
    (!context.travellerType || context.travellerType === "unknown") &&
    !canRecommendWithoutTravellerType(context)
  ) {
    return "travellerType";
  }
  if (context.travellerType === "family" && context.hasChildren === undefined) return "children";
  if (!hasSpecificLocation(context)) return "location";
  if (!places && needsVibeForBroadIntent(context)) return "vibe";
  if (
    (!context.timing || context.timing === "unknown") &&
    !context.vibe &&
    !context.requestedSubcategory &&
    !context.requestedStyle &&
    !context.budget
  ) return "timing";

  return null;
}
