import { listRelevantExperiencesForContext } from "./experiencesRepository.js";
import { listRelatedStoriesForContext } from "./storiesRepository.js";
import type { Place } from "../types/place.js";
import type { RetrievedFacts } from "../types/retrieval.js";
import type { UserContext } from "../types/userContext.js";

type BuildRetrievedFactsInput = {
  context: UserContext;
  selectedPlace?: Place;
  alternativePlace?: Place;
};

export async function buildRetrievedFacts({
  context,
  selectedPlace,
  alternativePlace
}: BuildRetrievedFactsInput): Promise<RetrievedFacts> {
  const [stories, experiences] = await Promise.all([
    listRelatedStoriesForContext(context),
    listRelevantExperiencesForContext(context)
  ]);

  return {
    places: [selectedPlace, alternativePlace].filter((place): place is Place => Boolean(place)),
    stories,
    experiences
  };
}
