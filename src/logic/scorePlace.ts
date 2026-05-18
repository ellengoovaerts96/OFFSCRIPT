import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { normalizeRegion } from "../utils/normalizeRegion.js";

export function scorePlace(place: Place, context: UserContext): number {
  let score = 0;

  const targetRegion = normalizeRegion(context.targetRegion ?? context.currentLocation);
  const placeRegion = normalizeRegion(place.region);
  const placeNeighbourhood = normalizeRegion(place.neighbourhood);

  if (targetRegion && (placeRegion === targetRegion || placeNeighbourhood === targetRegion)) score += 40;
  if (place.category === context.intent) score += 30;
  if (context.timing && place.bestTiming.includes(context.timing)) score += 15;
  if (context.travellerType && place.travellerTypes.includes(context.travellerType)) score += 10;
  if (context.hasChildren === true && place.childFriendly) score += 10;
  if (context.hasChildren === true && !place.childFriendly) score -= 50;
  if (place.status === "premium") score += 10;
  if (place.status === "archived") score -= 100;

  return score;
}
