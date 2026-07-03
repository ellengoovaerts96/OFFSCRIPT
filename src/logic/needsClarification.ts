import type { UserContext } from "../types/userContext.js";
import { normalizeRegion } from "../utils/normalizeRegion.js";

export type MissingContextField = "location" | "travellerType" | "children" | "intent" | "timing";

function hasSpecificLocation(context: UserContext): boolean {
  const location = normalizeRegion(context.currentLocation ?? context.targetRegion);

  if (!location) return false;
  if (location !== "Dakar") return true;

  return hasActionableIntent(context);
}

function hasActionableIntent(context: UserContext): boolean {
  return Boolean(context.intent && context.intent !== "unknown");
}

function canRecommendWithoutTravellerType(context: UserContext): boolean {
  return Boolean(hasSpecificLocation(context) && hasActionableIntent(context) && (context.timing || context.vibe));
}

export function needsClarification(context: UserContext): MissingContextField | null {
  if (
    (!context.travellerType || context.travellerType === "unknown") &&
    !canRecommendWithoutTravellerType(context)
  ) {
    return "travellerType";
  }
  if (context.travellerType === "family" && context.hasChildren === undefined) return "children";
  if (!hasSpecificLocation(context)) return "location";
  if (!context.intent || context.intent === "unknown") return "intent";
  if ((!context.timing || context.timing === "unknown") && !context.vibe) return "timing";

  return null;
}
