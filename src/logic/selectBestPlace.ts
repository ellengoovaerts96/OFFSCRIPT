import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { scorePlace } from "./scorePlace.js";

export const MIN_RECOMMENDATION_SCORE = 60;
export const MIN_ALTERNATIVE_RECOMMENDATION_SCORE = 45;

export type PlaceSelection = {
  place: Place;
  score: number;
};

export function selectBestPlace(places: Place[], context: UserContext): PlaceSelection | null {
  const candidates =
    context.travellerType === "family" || context.hasChildren === true
      ? places.filter((place) => place.childFriendly)
      : places;

  const ranked = candidates
    .map((place) => ({ place, score: scorePlace(place, context) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (!best || best.score < MIN_RECOMMENDATION_SCORE) {
    return null;
  }

  return best;
}

export function selectBestAlternativePlace(places: Place[], context: UserContext): PlaceSelection | null {
  if (!context.targetRegion && !context.currentLocation) return null;

  const contextWithoutLocation: UserContext = {
    ...context,
    currentLocation: undefined,
    targetRegion: undefined
  };

  const candidates =
    context.travellerType === "family" || context.hasChildren === true
      ? places.filter((place) => place.childFriendly)
      : places;

  const ranked = candidates
    .map((place) => ({ place, score: scorePlace(place, contextWithoutLocation) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (!best || best.score < MIN_ALTERNATIVE_RECOMMENDATION_SCORE) {
    return null;
  }

  return best;
}
