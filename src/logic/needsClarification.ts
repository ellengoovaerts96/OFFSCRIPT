import type { UserContext } from "../types/userContext.js";
import type { Place } from "../types/place.js";
import {
  isSpecificDirectRequest,
  MAX_CLARIFICATION_QUESTIONS,
  recommendationReadiness
} from "./recommendationReadiness.js";
import { findClarificationCandidates } from "./selectBestPlace.js";

export type MissingContextField = "travellerType" | "children" | "intent" | "subcategory" | "vibe" | "timing" | "budget";

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

const SPECIFIC_DISH_PRODUCTS = new Set([
  "thieboudienne", "yassa", "mafe", "ceebu_yapp", "soupe_kandia", "domoda",
  "grilled_fish", "continental_breakfast", "american_breakfast", "grilled_prawns"
]);

function hasSpecificDishProduct(context: UserContext): boolean {
  return (context.searchProfile?.products ?? []).some((product) =>
    SPECIFIC_DISH_PRODUCTS.has(product.trim().toLowerCase().replaceAll(" ", "_"))
  );
}

function hasActionableMoodOrIntent(context: UserContext): boolean {
  return Boolean((context.intent && context.intent !== "unknown") || context.vibe);
}

function canRecommendWithoutTravellerType(context: UserContext): boolean {
  if (isSpecificDirectRequest(context)) return true;

  return Boolean(
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
  if (context.intent === "food" && hasSpecificDishProduct(context)) return true;

  if (context.intent === "beach") {
    return Boolean(
      (context.requestedSubcategory && context.requestedSubcategory !== "beach") ||
      context.vibe
    );
  }

  // "International" still covers several very different cuisines. Ask one
  // useful follow-up instead of letting editorial priority choose arbitrarily.
  if (context.intent === "food" && context.requestedStyle) {
    return context.requestedStyle !== "international";
  }

  // For work, culture and similar experience-led requests, an explicit mood
  // such as artistic already distinguishes the useful database candidates.
  // Asking for a place type as well adds no value and tempts invented choices.
  if (context.vibe) return true;

  return Boolean(context.requestedSubcategory);
}

function needsSubcategory(context: UserContext): boolean {
  // A named dish already answers what the traveller wants to eat. Asking for
  // another cuisine/style or meal format only repeats the same decision.
  if (context.intent === "food" && hasSpecificDishProduct(context)) return false;

  // Lunch or dinner determines when someone wants to eat, not what kind of
  // food they want. Keep broad meal requests open until cuisine/style is known
  // so editorial priority cannot arbitrarily turn "lunch" into pizza.
  if (context.intent === "drink" && context.timing && context.timing !== "unknown") return false;

  const normalizedSubcategory = context.requestedSubcategory?.trim().toLowerCase();
  if (
    context.intent === "food" &&
    ["breakfast", "lunch", "dinner"].includes(normalizedSubcategory ?? "") &&
    !context.requestedStyle
  ) {
    return true;
  }
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
