import type { Experience } from "./experience.js";
import type { Place } from "./place.js";
import type { RetrievedStory } from "./story.js";

export type RetrievedFacts = {
  places: Place[];
  stories: RetrievedStory[];
  experiences: Experience[];
};
