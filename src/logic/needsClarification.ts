import type { UserContext } from "../types/userContext.js";
import type { Place } from "../types/place.js";
import { normalizeRegion } from "../utils/normalizeRegion.js";
import {
  isSpecificDirectRequest,
  MAX_CLARIFICATION_QUESTIONS,
  recommendationReadiness
} from "./recommendationReadiness.js";
import { findMatchingCandidates } from "./selectBestPlace.js";

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
  "shopping"
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

  return Boolean(context.requestedSubcategory);
}

function needsSubcategory(context: UserContext): boolean {
  // A meal moment already makes a broad food request actionable. Asking what
  // to eat as well would waste one of the three available questions.
  if (context.intent === "food" && context.timing && context.timing !== "unknown") return false;

  return Boolean(
    context.intent &&
    context.intent !== "unknown" &&
    SUBCATEGORY_REQUIRED_INTENTS.has(context.intent) &&
    !hasMeaningfulSubcategory(context)
  );
}

export function needsClarification(context: UserContext, places?: Place[]): MissingContextField | null {
  // Start with what the person actually wants. Audience and logistics only
  // become useful after the request itself is understood.
  if (!context.intent || context.intent === "unknown") return "intent";

  if ((context.clarificationCount ?? 0) >= MAX_CLARIFICATION_QUESTIONS) return null;

  if (needsSubcategory(context)) return "subcategory";

  if (places) {
    const candidates = findMatchingCandidates(places, context);

    // One clear database match needs no logistical questionnaire. With several
    // valid choices, location and price are useful discriminators. With none,
    // proceed to the normal no-match response instead of asking irrelevant
    // preference questions.
    if (candidates.length <= 1) return null;
    if (!hasSpecificLocation(context)) return "location";
    if (!context.budget) return "budget";
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
