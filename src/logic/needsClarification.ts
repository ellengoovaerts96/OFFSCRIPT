import type { UserContext } from "../types/userContext.js";

export type MissingContextField = "location" | "travellerType" | "children" | "intent" | "timing";

export function needsClarification(context: UserContext): MissingContextField | null {
  if (!context.targetRegion && !context.currentLocation) return "location";
  if (!context.travellerType || context.travellerType === "unknown") return "travellerType";
  if (context.travellerType === "family" && context.hasChildren === undefined) return "children";
  if (!context.intent || context.intent === "unknown") return "intent";
  if (!context.timing || context.timing === "unknown") return "timing";

  return null;
}
