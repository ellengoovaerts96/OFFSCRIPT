import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import {
  isSpecificFocus,
  placeMatchesSpecificFocus,
  scorePlace
} from "./scorePlace.js";
import { scoreSearchProfilePreferences } from "./searchProfileMatching.js";

export type RankedPlace = {
  place: Place;
  score: number;
  matchScore: number;
  preferenceScore: number;
  editorialScore: number;
};

function scoreEditorialJudgement(place: Place): number {
  let score = 0;
  score += place.offscriptPickLevel * 6;
  score += Math.round(place.offscriptPriority / 5);
  if (place.status === "premium") score += 10;
  if (place.status === "archived") score -= 100;
  return score;
}

function budgetFitTier(place: Place, budget: UserContext["budget"]): number {
  if (!budget || place.priceLevel === undefined) return 1;
  if (budget === "budget") return place.priceLevel === 1 ? 2 : place.priceLevel === 2 ? 1 : 0;
  if (budget === "affordable") return place.priceLevel === 2 ? 2 : place.priceLevel === 1 ? 1 : 0;
  if (budget === "mid-range") return place.priceLevel === 3 ? 2 : 0;
  // When no level-4 option exists, prefer the nearest cheaper tier before
  // editorial judgement. A mid-range match is a more honest fallback for an
  // upscale request than an unrelated budget favourite.
  if (budget === "upscale") return place.priceLevel === 4 ? 3 : place.priceLevel === 3 ? 2 : place.priceLevel === 5 ? 1 : 0;
  if (budget === "luxury") return place.priceLevel === 5 ? 2 : place.priceLevel === 4 ? 1 : 0;
  return 1;
}

function compareRankedPlaces(
  left: RankedPlace,
  right: RankedPlace,
  context: UserContext
): number {
  const leftBudgetFit = budgetFitTier(left.place, context.budget);
  const rightBudgetFit = budgetFitTier(right.place, context.budget);
  if (rightBudgetFit !== leftBudgetFit) return rightBudgetFit - leftBudgetFit;

  // A distinctive but still soft vibe preference (for example reggae) may
  // reorder valid candidates, but it must never remove non-matching places.
  // This preserves useful fallbacks while respecting an explicit user signal.
  if (isSpecificFocus(context.vibe)) {
    const leftVibeFit = placeMatchesSpecificFocus(left.place, context.vibe) ? 1 : 0;
    const rightVibeFit = placeMatchesSpecificFocus(right.place, context.vibe) ? 1 : 0;
    if (rightVibeFit !== leftVibeFit) return rightVibeFit - leftVibeFit;
  }

  // Hard filters and profile narrowing have already established relevance.
  // Editorial judgement must therefore decide between comparable valid
  // options instead of being drowned out by incidental keyword matches.
  if (right.editorialScore !== left.editorialScore) {
    return right.editorialScore - left.editorialScore;
  }
  if (right.place.offscriptPriority !== left.place.offscriptPriority) {
    return right.place.offscriptPriority - left.place.offscriptPriority;
  }

  const leftUserMatch = left.matchScore + left.preferenceScore;
  const rightUserMatch = right.matchScore + right.preferenceScore;
  if (rightUserMatch !== leftUserMatch) return rightUserMatch - leftUserMatch;
  if (right.score !== left.score) return right.score - left.score;
  return left.place.name.localeCompare(right.place.name);
}

export function rankRelevantPlaces(
  places: Place[],
  context: UserContext
): RankedPlace[] {
  return places
    .map((place): RankedPlace => {
      const matchScore = scorePlace(place, context);
      const preferenceScore = scoreSearchProfilePreferences(
        place,
        context.searchProfile
      );
      const editorialScore = scoreEditorialJudgement(place);

      return {
        place,
        matchScore,
        preferenceScore,
        editorialScore,
        score: matchScore + preferenceScore + editorialScore
      };
    })
    .sort((left, right) => compareRankedPlaces(left, right, context));
}
