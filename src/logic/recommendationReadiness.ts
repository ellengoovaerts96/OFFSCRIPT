import type { UserContext } from "../types/userContext.js";
import { normalizeRegion } from "../utils/normalizeRegion.js";

export const MAX_CLARIFICATION_QUESTIONS = 3;
export const RECOMMENDATION_READINESS_THRESHOLD = 90;

export type RecommendationReadiness = {
  score: number;
  ready: boolean;
  reasons: string[];
};

function hasKnownLocation(context: UserContext): boolean {
  return Boolean(normalizeRegion(context.targetRegion ?? context.currentLocation));
}

function hasKnownTravellerType(context: UserContext): boolean {
  return Boolean(context.travellerType && context.travellerType !== "unknown");
}

function childrenRequirementSatisfied(context: UserContext): boolean {
  return context.travellerType !== "family" || context.hasChildren !== undefined;
}

function hasStyleSignal(context: UserContext): boolean {
  return Boolean(context.requestedSubcategory || context.requestedStyle || context.budget || context.vibe);
}

export function isSpecificDirectRequest(context: UserContext): boolean {
  return Boolean(
    context.directRequest &&
      context.intent &&
      context.intent !== "unknown" &&
      (context.requestedSubcategory || context.vibe)
  );
}

export function recommendationReadiness(context: UserContext): RecommendationReadiness {
  let score = 0;
  const reasons: string[] = [];

  if (context.intent && context.intent !== "unknown") {
    score += 30;
    reasons.push("intent");
  }
  if (hasKnownLocation(context)) {
    score += 25;
    reasons.push("location_or_mobility");
  }
  if (hasKnownTravellerType(context)) {
    score += 15;
    reasons.push("traveller_type");
  }
  if (childrenRequirementSatisfied(context)) {
    score += 15;
    reasons.push("children_requirement");
  }
  if (hasStyleSignal(context)) {
    score += 15;
    reasons.push("specific_preference");
  }

  const questionLimitReached = (context.clarificationCount ?? 0) >= MAX_CLARIFICATION_QUESTIONS;
  const ready =
    isSpecificDirectRequest(context) ||
    questionLimitReached ||
    (score >= RECOMMENDATION_READINESS_THRESHOLD && Boolean(context.intent && context.intent !== "unknown"));

  return { score, ready, reasons };
}
