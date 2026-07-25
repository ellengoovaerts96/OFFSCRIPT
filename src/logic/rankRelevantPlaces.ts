import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { scorePlace } from "./scorePlace.js";
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

function compareRankedPlaces(left: RankedPlace, right: RankedPlace): number {
  if (right.score !== left.score) return right.score - left.score;

  const leftUserMatch = left.matchScore + left.preferenceScore;
  const rightUserMatch = right.matchScore + right.preferenceScore;
  if (rightUserMatch !== leftUserMatch) return rightUserMatch - leftUserMatch;
  if (right.editorialScore !== left.editorialScore) {
    return right.editorialScore - left.editorialScore;
  }
  if (right.place.offscriptPriority !== left.place.offscriptPriority) {
    return right.place.offscriptPriority - left.place.offscriptPriority;
  }
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
    .sort(compareRankedPlaces);
}
