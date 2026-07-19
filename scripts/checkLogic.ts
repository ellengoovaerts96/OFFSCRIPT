import "dotenv/config";
import { pool } from "../src/integrations/postgres.js";
import { inferContextualFoodStyle, inferTextVibe } from "../src/ai/buildUserContext.js";
import { resolveConversationLanguage } from "../src/ai/detectLanguage.js";
import { buildOffscriptWelcomeResponse, isOffscriptStartMessage } from "../src/logic/greeting.js";
import { listRecommendationPlaces } from "../src/data/placesRepository.js";
import { buildClarifyingQuestion } from "../src/logic/buildClarifyingQuestion.js";
import { needsClarification } from "../src/logic/needsClarification.js";
import { recommendationReadiness } from "../src/logic/recommendationReadiness.js";
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

const dinnerContexts: UserContext[] = [
  { language: "en", intent: "food", timing: "evening", clarificationCount: 0 },
  { language: "en", intent: "food", timing: "evening", travellerType: "family", clarificationCount: 1 },
  { language: "en", intent: "food", timing: "evening", travellerType: "family", hasChildren: true, clarificationCount: 2 },
  { language: "en", intent: "food", timing: "evening", travellerType: "family", hasChildren: true, clarificationCount: 3 }
];

const expectedDinnerQuestions = ["travellerType", "children", "location", null];
const actualDinnerQuestions = dinnerContexts.map(needsClarification);

if (JSON.stringify(actualDinnerQuestions) !== JSON.stringify(expectedDinnerQuestions)) {
  throw new Error(`Dinner clarification flow mismatch: ${JSON.stringify(actualDinnerQuestions)}`);
}

const pizzaQuestion = needsClarification({
  language: "en",
  intent: "food",
  requestedSubcategory: "pizza",
  clarificationCount: 0
});
if (pizzaQuestion !== "vibe") throw new Error(`Pizza should ask about style, received ${pizzaQuestion}`);
if (inferTextVibe("je veux une pizza") !== undefined) {
  throw new Error("Pizza must be stored as a subcategory, never as a vibe.");
}
if (inferContextualFoodStyle("bon restaurant", "pizza") !== "italian_restaurant") {
  throw new Error("The restaurant answer to a pizza style question must be recognized.");
}
if (inferContextualFoodStyle("bon restaurant", "seafood") !== undefined) {
  throw new Error("Pizza style answers must only be interpreted inside the pizza flow.");
}
const genericFoodStyleQuestion = buildClarifyingQuestion("vibe", { language: "fr", intent: "food" });
if (/pizza|seafood|beach/i.test(genericFoodStyleQuestion)) {
  throw new Error("Food style questions must not list subcategories as vibes.");
}

const cultureQuestion = needsClarification({ language: "fr", intent: "culture", clarificationCount: 0 });
if (cultureQuestion !== "subcategory") throw new Error(`Culture should ask for a subcategory, received ${cultureQuestion}`);

const directRastaQuestion = needsClarification({
  language: "nl",
  intent: "drink",
  requestedSubcategory: "bar",
  vibe: "rasta_reggae",
  directRequest: true,
  clarificationCount: 0
});
if (directRastaQuestion !== null) throw new Error(`A direct rasta request should be recommendation-ready.`);

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
        recognisesNewOffscriptStart: isOffscriptStartMessage("Bonjour OFFSCRIPT 👋"),
        recognisesFlyerOffscriptStart: isOffscriptStartMessage("Start OFFSCRIPT 👋"),
        offscriptWelcome: buildOffscriptWelcomeResponse(),
        dinnerQuestionOrder: actualDinnerQuestions,
        pizzaQuestion,
        cultureQuestion,
        directRastaQuestion,
        dinnerReadinessAfterThreeQuestions: recommendationReadiness(dinnerContexts[3]),
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
