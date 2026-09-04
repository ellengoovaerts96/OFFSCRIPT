import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import {
  isSpecificFocus,
  placeMatchesIntent,
  placeMatchesLocation,
  placeMatchesSpecificFocus
} from "./scorePlace.js";
import {
  narrowCandidatesBySearchProfile,
  placePassesSearchProfileHardConstraints
} from "./searchProfileMatching.js";
import { rankRelevantPlaces, type RankedPlace } from "./rankRelevantPlaces.js";

export const MIN_RECOMMENDATION_SCORE = 60;
export const MIN_ALTERNATIVE_RECOMMENDATION_SCORE = 45;

export type PlaceSelection = RankedPlace;

function shouldRequireIntentMatch(context: UserContext): boolean {
  return Boolean(context.intent && context.intent !== "unknown");
}

function candidateMatchesContextIntent(place: Place, context: UserContext): boolean {
  if (!shouldRequireIntentMatch(context)) return true;

  return (
    placeMatchesIntent(place, context.intent as string) ||
    Boolean(
      context.requestedSubcategory &&
      placeMatchesSpecificFocus(place, context.requestedSubcategory)
    )
  );
}

export function placePassesHardConstraints(place: Place, context: UserContext): boolean {
  if (!candidateMatchesContextIntent(place, context)) return false;
  if ((context.requestedAmenities ?? []).some((amenity) => !(place.amenities ?? []).includes(amenity as Place["amenities"][number]))) return false;
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

  return travellerCandidates.filter(
    (place) =>
      placePassesHardConstraints(place, context) &&
      placePassesSearchProfileHardConstraints(place, context.searchProfile)
  );
}

function targetLocationForContext(context: UserContext): string | undefined {
  return context.targetRegion ?? context.currentLocation;
}

function localCandidatesForContext(places: Place[], context: UserContext): Place[] {
  const targetLocation = targetLocationForContext(context);
  if (!targetLocation || targetLocation === "Dakar") return places;

  const localCandidates = places.filter((place) => placeMatchesLocation(place, targetLocation));

  // A named neighbourhood is a hard boundary until the user explicitly says
  // that another area is acceptable. Never silently recommend a place from a
  // different neighbourhood merely because its content score is high.
  return localCandidates;
}

function focusCandidatesForContext(places: Place[], context: UserContext): Place[] {
  const requestedSubcategory = context.requestedSubcategory;
  if (requestedSubcategory) {
    return places.filter((place) => placeMatchesSpecificFocus(place, requestedSubcategory));
  }

  // Explicit distinctive preferences are promises, not optional ranking
  // bonuses. If no artistic (or similarly specific) option exists in the
  // chosen neighbourhood, return no match and let the conversation offer a
  // broader search instead of recommending an unrelated generic venue.
  if (isSpecificFocus(context.vibe)) {
    return places.filter((place) => placeMatchesSpecificFocus(place, context.vibe));
  }

  return places;
}

export function findMatchingCandidates(places: Place[], context: UserContext): Place[] {
  return localCandidatesForContext(
    focusCandidatesForContext(
      narrowCandidatesBySearchProfile(filterCandidates(places, context), context.searchProfile),
      context
    ),
    context
  );
}

/**
 * Returns every hard-valid, contextually comparable option before soft
 * SearchProfile preferences narrow the result set. Clarification logic uses
 * this broader set so a soft signal (for example "ocean") cannot silently
 * choose one bar and skip a useful budget question.
 */
export function findClarificationCandidates(places: Place[], context: UserContext): Place[] {
  return localCandidatesForContext(
    focusCandidatesForContext(filterCandidates(places, context), context),
    context
  );
}

export function selectBestPlace(places: Place[], context: UserContext): PlaceSelection | null {
  const candidates = findMatchingCandidates(places, context);

  const ranked = rankRelevantPlaces(candidates, context);

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
  if (
    context.targetRegion !== "Dakar" &&
    context.searchProfile?.mobility !== "dakar_wide"
  ) {
    return null;
  }

  const contextWithoutLocation: UserContext = {
    ...context,
    currentLocation: undefined,
    targetRegion: undefined,
    searchProfile: context.searchProfile
      ? {
          ...context.searchProfile,
          neighbourhood: undefined,
          mobility: "dakar_wide"
        }
      : undefined
  };

  const candidates = focusCandidatesForContext(
    narrowCandidatesBySearchProfile(
      filterCandidates(places, contextWithoutLocation),
      contextWithoutLocation.searchProfile
    ),
    contextWithoutLocation
  );

  const ranked = rankRelevantPlaces(candidates, contextWithoutLocation);

  const best = ranked[0];

  if (!best || best.score < MIN_ALTERNATIVE_RECOMMENDATION_SCORE) {
    return null;
  }

  return best;
}
