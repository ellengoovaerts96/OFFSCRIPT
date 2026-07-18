import "dotenv/config";
import { pool } from "../src/integrations/postgres.js";
import { inferTextVibe } from "../src/ai/buildUserContext.js";
import { resolveConversationLanguage } from "../src/ai/detectLanguage.js";
import { listRecommendationPlaces } from "../src/data/placesRepository.js";
import { buildClarifyingQuestion } from "../src/logic/buildClarifyingQuestion.js";
import { needsClarification } from "../src/logic/needsClarification.js";
import { selectBestPlace } from "../src/logic/selectBestPlace.js";
import type { UserContext } from "../src/types/userContext.js";

const context: UserContext = {
  language: "en",
  targetRegion: "Mbour",
  travellerType: "friends",
  hasChildren: false,
  intent: "culture",
  timing: "morning"
};

const incompleteContext: UserContext = {
  language: "en",
  targetRegion: "Mbour"
};

const rastaBarContext: UserContext = {
  language: "nl",
  targetRegion: "Dakar",
  intent: "drink",
  requestedSubcategory: "bar",
  vibe: "rasta_reggae"
};

try {
  const places = await listRecommendationPlaces();
  const selection = selectBestPlace(places, context);
  const rastaBarSelection = selectBestPlace(places, rastaBarContext);
  const missingField = needsClarification(incompleteContext);

  console.log(
    JSON.stringify(
      {
        selectedPlace: selection?.place.name ?? null,
        score: selection?.score ?? null,
        rastaBarSelection: rastaBarSelection?.place.name ?? null,
        rastaBarScore: rastaBarSelection?.score ?? null,
        inferredRastaVibe: inferTextVibe("Waar kan ik een rasta bar vinden?"),
        englishAfterFrenchReset: resolveConversationLanguage("Is there an Irish pub?", "fr"),
        missingField,
        clarifyingQuestion: missingField ? buildClarifyingQuestion(missingField, incompleteContext) : null
      },
      null,
      2
    )
  );
} finally {
  await pool.end();
}
