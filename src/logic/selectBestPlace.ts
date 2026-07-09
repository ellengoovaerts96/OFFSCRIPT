import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import {
  isSpecificFocus,
  placeMatchesIntent,
  placeMatchesLocation,
  placeMatchesSpecificFocus,
  scorePlace
} from "./scorePlace.js";

export const MIN_RECOMMENDATION_SCORE = 60;
export const MIN_ALTERNATIVE_RECOMMENDATION_SCORE = 45;

export type PlaceSelection = {
  place: Place;
  score: number;
};

function shouldRequireIntentMatch(context: UserContext): boolean {
  return Boolean(context.intent && context.intent !== "unknown");
}

function candidateMatchesContextIntent(place: Place, context: UserContext): boolean {
  if (!shouldRequireIntentMatch(context)) return true;

  return placeMatchesIntent(place, context.intent as string);
}

function filterCandidates(places: Place[], context: UserContext): Place[] {
  const travellerCandidates =
    context.travellerType === "family" || context.hasChildren === true
      ? places.filter((place) => place.childFriendly)
      : places;

  return travellerCandidates.filter((place) => candidateMatchesContextIntent(place, context));
}

function targetLocationForContext(context: UserContext): string | undefined {
  return context.targetRegion ?? context.currentLocation;
}

function localCandidatesForContext(places: Place[], context: UserContext): Place[] {
  const targetLocation = targetLocationForContext(context);
  if (!targetLocation || targetLocation === "Dakar") return places;

  const localCandidates = places.filter((place) => placeMatchesLocation(place, targetLocation));

  return localCandidates.length ? localCandidates : places;
}

function focusCandidatesForContext(places: Place[], context: UserContext): Place[] {
  if (!isSpecificFocus(context.vibe)) return places;

  const focusCandidates = places.filter((place) => placeMatchesSpecificFocus(place, context.vibe));

  return focusCandidates.length ? focusCandidates : places;
}

export function selectBestPlace(places: Place[], context: UserContext): PlaceSelection | null {
  const candidates = localCandidatesForContext(focusCandidatesForContext(filterCandidates(places, context), context), context);

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

  const candidates = filterCandidates(places, contextWithoutLocation);

  const ranked = candidates
    .map((place) => ({ place, score: scorePlace(place, contextWithoutLocation) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (!best || best.score < MIN_ALTERNATIVE_RECOMMENDATION_SCORE) {
    return null;
  }

  return best;
}
