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

export function placePassesHardConstraints(place: Place, context: UserContext): boolean {
  if (!candidateMatchesContextIntent(place, context)) return false;
  if ((context.excludedCategories ?? []).some((category) => place.categories.includes(category as Place["categories"][number]))) return false;
  if ((context.excludedSubcategories ?? []).some((focus) => placeMatchesSpecificFocus(place, focus))) return false;
  if ((context.dietaryExclusions ?? []).some((focus) => placeMatchesSpecificFocus(place, focus))) return false;
  if (context.maximumPriceLevel !== undefined && place.priceLevel !== undefined && place.priceLevel > context.maximumPriceLevel) return false;
  if ((context.avoidAudienceTags ?? []).some((tag) => place.audienceTags.includes(tag))) return false;
  if (context.alcoholAllowed === false && (place.categories.includes("bar") || place.categories.includes("nightlife"))) return false;
  return true;
}

function filterCandidates(places: Place[], context: UserContext): Place[] {
  const travellerCandidates =
    context.travellerType === "family" || context.hasChildren === true
      ? places.filter((place) => place.childFriendly)
      : places;

  return travellerCandidates.filter((place) => placePassesHardConstraints(place, context));
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
  const requestedSubcategory = context.requestedSubcategory;
  const subcategoryCandidates = requestedSubcategory
    ? places.filter((place) => placeMatchesSpecificFocus(place, requestedSubcategory))
    : places;

  if (!isSpecificFocus(context.vibe)) return subcategoryCandidates;

  return subcategoryCandidates.filter((place) => placeMatchesSpecificFocus(place, context.vibe));
}

export function selectBestPlace(places: Place[], context: UserContext): PlaceSelection | null {
  const candidates = localCandidatesForContext(focusCandidatesForContext(filterCandidates(places, context), context), context);

  const ranked = candidates
    .map((place) => ({ place, score: scorePlace(place, context) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  const minimumScore = (context.clarificationCount ?? 0) >= 3
    ? MIN_ALTERNATIVE_RECOMMENDATION_SCORE
    : MIN_RECOMMENDATION_SCORE;

  if (!best || best.score < minimumScore) {
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

  const candidates = focusCandidatesForContext(filterCandidates(places, contextWithoutLocation), contextWithoutLocation);

  const ranked = candidates
    .map((place) => ({ place, score: scorePlace(place, contextWithoutLocation) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (!best || best.score < MIN_ALTERNATIVE_RECOMMENDATION_SCORE) {
    return null;
  }

  return best;
}
