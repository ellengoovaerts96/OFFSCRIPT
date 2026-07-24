import "dotenv/config";
import { pool } from "../src/integrations/postgres.js";
import { inferContextualBudget, inferContextualFoodStyle, inferTextVibe, rejectsRequestedSubcategory } from "../src/ai/buildUserContext.js";
import { detectIntent } from "../src/ai/detectIntent.js";
import { resolveConversationLanguage } from "../src/ai/detectLanguage.js";
import { buildOffscriptWelcomeResponse, isOffscriptStartMessage } from "../src/logic/greeting.js";
import { listRecommendationPlaces } from "../src/data/placesRepository.js";
import { buildClarifyingQuestion } from "../src/logic/buildClarifyingQuestion.js";
import { needsClarification } from "../src/logic/needsClarification.js";
import { recommendationReadiness } from "../src/logic/recommendationReadiness.js";
import { placePassesHardConstraints, selectBestPlace } from "../src/logic/selectBestPlace.js";
import { scorePlace } from "../src/logic/scorePlace.js";
import type { Place } from "../src/types/place.js";
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
if (inferContextualBudget("bon restaurant", "pizza") !== "upscale") {
  throw new Error("The restaurant pizza option must prefer the more upscale match.");
}
if (detectIntent("Ik wil geen pizza, gewoon een chilled drink.") !== "drink") {
  throw new Error("A negated pizza must not override the positive drink intent.");
}
if (!rejectsRequestedSubcategory("Ik wil geen pizza, gewoon een chilled drink.", "pizza")) {
  throw new Error("An explicitly rejected pizza preference must clear the previous subcategory.");
}
if (inferTextVibe("gewoon een chilled drink") !== "calm") {
  throw new Error("Chill/chilled must be recognized as a calm vibe.");
}
const semanticTestPlace = {
  name: "Semantic test", categories: ["food"],
  subcategories: [{ id: "pizza", name: "Pizza", displayOrder: 1, images: [] }],
  bestFor: [], vibeTags: [], audienceTags: ["tourists"], priceLevel: 4, childFriendly: true
} as unknown as Place;
if (placePassesHardConstraints(semanticTestPlace, { language: "nl", intent: "food", excludedSubcategories: ["pizza"] })) {
  throw new Error("An excluded subcategory must be removed before ranking.");
}
if (placePassesHardConstraints(semanticTestPlace, { language: "nl", intent: "food", avoidAudienceTags: ["tourists"] })) {
  throw new Error("An avoided audience tag must be removed before ranking.");
}
if (placePassesHardConstraints(semanticTestPlace, { language: "nl", intent: "food", maximumPriceLevel: 2 })) {
  throw new Error("A place above the maximum price level must be removed before ranking.");
}
const surfTestPlace = {
  name: "Dakar Surf Atlantique",
  region: "Dakar",
  neighbourhood: "Yoff",
  categories: ["activity"],
  subcategories: [{ id: "surfing", name: "Surf lessons", displayOrder: 1, images: [] }],
  bestFor: [],
  vibeTags: [],
  audienceTags: [],
  occasionTags: [],
  travellerTypes: [],
  images: [],
  offscriptPickLevel: 0,
  offscriptPriority: 0,
  childFriendly: false,
  status: "published"
} as unknown as Place;
const surfContext: UserContext = {
  language: "nl",
  targetRegion: "Dakar",
  intent: "sports",
  requestedSubcategory: "surfing"
};
if (!placePassesHardConstraints(surfTestPlace, surfContext)) {
  throw new Error("A specific surfing match must not be rejected because its broad category label differs.");
}
if (scorePlace(surfTestPlace, surfContext) < 60) {
  throw new Error("A specific surfing match must reach the recommendation threshold.");
}
const beachReggaePlace = {
  name: "La Payotte",
  region: "Dakar",
  neighbourhood: "Yoff",
  categories: ["drink"],
  subcategories: [{ id: "bar", name: "Bar", displayOrder: 1, images: [] }],
  bestFor: [],
  vibe: "Rasta & Reggae",
  vibeTags: ["rasta_reggae"],
  audienceTags: [],
  occasionTags: ["drinks", "live_music", "nightlife"],
  travellerTypes: [],
  images: [],
  offscriptPickLevel: 0,
  offscriptPriority: 50,
  childFriendly: false,
  status: "published"
} as unknown as Place;
const beachReggaeContext: UserContext = {
  language: "nl",
  targetRegion: "Dakar",
  intent: "drink",
  requestedSubcategory: "beach",
  vibe: "rasta_reggae"
};
if (selectBestPlace([beachReggaePlace], beachReggaeContext)?.place.name !== "La Payotte") {
  throw new Error("A reggae drink request must retain La Payotte when only the beach metadata is incomplete.");
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
  const upscalePizzaSelection = selectBestPlace(places, {
    language: "fr",
    targetRegion: "Dakar",
    intent: "food",
    requestedSubcategory: "pizza",
    vibe: "italian_restaurant",
    budget: "upscale"
  });
  if (upscalePizzaSelection?.place.name !== "Pizzammore") {
    throw new Error(`Upscale pizza should select Pizzammore, received ${upscalePizzaSelection?.place.name ?? "none"}.`);
  }
  const missingField = needsClarification(incompleteContext);

  console.log(
    JSON.stringify(
      {
        selectedPlace: selection?.place.name ?? null,
        score: selection?.score ?? null,
        rastaBarSelection: rastaBarSelection?.place.name ?? null,
        rastaBarScore: rastaBarSelection?.score ?? null,
        upscalePizzaSelection: upscalePizzaSelection.place.name,
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
