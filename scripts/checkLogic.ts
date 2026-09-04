import "dotenv/config";
import { pool } from "../src/integrations/postgres.js";
import {
  acceptsBroaderLocation,
  acceptsBroaderLocationInContext,
  buildUserContext,
  inferContextualBudget,
  inferContextualFoodStyle,
  inferBudget,
  inferRequestedStyle,
  inferRequestedSubcategory,
  inferTiming,
  isLocalSenegaleseDishRequest,
  isLocalSenegaleseFoodRequest,
  inferRequestedAmenities,
  inferTextVibe,
  mergeIntent,
  rejectsRequestedSubcategory,
  resolveRequestedSubcategory
} from "../src/ai/buildUserContext.js";
import { detectIntent } from "../src/ai/detectIntent.js";
import { resolveConversationLanguage } from "../src/ai/detectLanguage.js";
import { buildOffscriptWelcomeResponse, isOffscriptStartMessage } from "../src/logic/greeting.js";
import { isRecommendationFeedbackOnly } from "../src/logic/chatbotFlow.js";
import { listRecommendationPlaces } from "../src/data/placesRepository.js";
import { buildClarifyingQuestion, buildLocalDishLocationQuestion } from "../src/logic/buildClarifyingQuestion.js";
import { needsClarification } from "../src/logic/needsClarification.js";
import { recommendationReadiness } from "../src/logic/recommendationReadiness.js";
import { placePassesHardConstraints, selectBestPlace } from "../src/logic/selectBestPlace.js";
import { placePassesSearchProfileHardConstraints } from "../src/logic/searchProfileMatching.js";
import { scorePlace } from "../src/logic/scorePlace.js";
import { vibeTagAliases } from "../src/logic/vibeTags.js";
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

if (acceptsBroaderLocation("Ik zou graag een andere plek ontdekken")) {
  throw new Error("A request for another place must not silently broaden the neighbourhood.");
}
if (!acceptsBroaderLocation("Ik zou graag een andere buurt ontdekken")) {
  throw new Error("An explicit request for another neighbourhood must broaden the search.");
}
if (!acceptsBroaderLocationInContext(
  "Ça va",
  "Est-ce que tu veux te déplacer dans un autre quartier de Dakar ? Je peux chercher plus largement."
)) {
  throw new Error("A French contextual acceptance must continue the proposed broader search.");
}
if (acceptsBroaderLocationInContext("Ça va", "Comment ça va ?")) {
  throw new Error("Ça va must only broaden location after an explicit broader-location question.");
}
if (inferTextVibe("ik zoek een creatieve plek om te werken") !== "artistic") {
  throw new Error("A creative workplace request must retain its artistic preference.");
}
if (inferTextVibe("het mag artistiek zijn") !== "artistic") {
  throw new Error("An artistic follow-up must be treated as a meaningful vibe.");
}
if (!vibeTagAliases("artistic").includes("art gallery")) {
  throw new Error("Art-gallery place data must satisfy an artistic preference.");
}

const directCoffeeContext = await buildUserContext({
  message: "waar kan ik de lekkerste koffie drinken?",
  previousContext: { language: "nl", clarificationCount: 0 },
  subcategoryTaxonomy: [{ name: "bar", intent: "drink" }]
});
if (
  directCoffeeContext.context.intent !== "drink" ||
  !directCoffeeContext.context.searchProfile?.products.includes("coffee")
) {
  throw new Error("A direct coffee request must use the deterministic database context flow.");
}

const broadenedCoffeeContext = await buildUserContext({
  message: "zeker!",
  previousContext: {
    ...directCoffeeContext.context,
    targetRegion: "Yoff",
    clarificationCount: 1
  },
  previousAssistantMessage: "Ik heb nog geen sterke TUUTI-pick in Yoff. Wil je naar een andere buurt in Dakar gaan? Dan kan ik breder zoeken.",
  subcategoryTaxonomy: [{ name: "bar", intent: "drink" }]
});
if (
  broadenedCoffeeContext.context.targetRegion !== "Dakar" ||
  broadenedCoffeeContext.context.searchProfile?.mobility !== "dakar_wide" ||
  !broadenedCoffeeContext.context.searchProfile?.products.includes("coffee")
) {
  throw new Error("An affirmative answer to the broader-location question must search all Dakar while retaining coffee.");
}

if (!isOffscriptStartMessage("Bonjour TUUTI 👋")) {
  throw new Error("The TUUTI website WhatsApp message must start the welcome flow.");
}
if (!isOffscriptStartMessage("Start TUUTI 👋")) {
  throw new Error("A TUUTI start message must start the welcome flow.");
}
if (!isOffscriptStartMessage("Bonjour TUUTI �")) {
  throw new Error("A TUUTI website start with a damaged emoji must still start the welcome flow.");
}
if (isOffscriptStartMessage("Bonjour TUUTI, je cherche un restaurant")) {
  throw new Error("A specific TUUTI question must remain a normal conversation message.");
}
if (resolveConversationLanguage("heel mooi logo!", "fr") !== "nl") {
  throw new Error("A clearly Dutch short aside must override an earlier French conversation language.");
}
if (resolveConversationLanguage("aangename kennismaking!", "fr") !== "nl") {
  throw new Error("The newest user's Dutch language must override the earlier French conversation language.");
}
if (resolveConversationLanguage("hallo!", "fr") !== "nl") {
  throw new Error("An ambiguous 'hallo' greeting must prefer Dutch over German or the previous language.");
}
if (resolveConversationLanguage("Heb je nog een andere optie?", "nl") !== "nl") {
  throw new Error("A Dutch alternative request must not switch the conversation to French.");
}
if (resolveConversationLanguage("Can you do my dishes?", "fr") !== "en") {
  throw new Error("A complete English off-topic request must override the French reset default.");
}
if (!isRecommendationFeedbackOnly("Parfait!")) {
  throw new Error("Parfait after a recommendation must be recognized as positive feedback.");
}

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
const actualDinnerQuestions = dinnerContexts.map((dinnerContext) => needsClarification(dinnerContext));

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
if (inferBudget("chic") !== "upscale") {
  throw new Error("A direct answer of chic must be stored as an upscale budget preference.");
}
if (inferBudget("luxe") !== "luxury") {
  throw new Error("A direct answer of luxe must be stored as a luxury budget preference.");
}
for (const dish of ["Thiéboudienne", "Yassa", "Mafé"]) {
  if (detectIntent(`Ik wil ${dish} eten`) !== "food") {
    throw new Error(`${dish} must be recognized as a food request.`);
  }
  if (!isLocalSenegaleseDishRequest(dish) || inferRequestedStyle(dish) !== "local") {
    throw new Error(`${dish} must be recognized as local Senegalese food.`);
  }
}
if (!/buurt/i.test(buildLocalDishLocationQuestion({ language: "nl", intent: "food", requestedStyle: "local" }))) {
  throw new Error("A broad local dish request must ask for the neighbourhood.");
}
if (detectIntent("Ik wil lokale gerechten eten") !== "food" || inferRequestedStyle("Ik wil lokale gerechten eten") !== "local") {
  throw new Error("A general request for local food must be recognized as local food.");
}
for (const request of [
  "Je veux manger sénégalais",
  "Je cherche de la cuisine sénégalaise",
  "Ik wil Senegalees eten",
  "I want Senegalese food"
]) {
  if (!isLocalSenegaleseFoodRequest(request) || inferRequestedStyle(request) !== "local") {
    throw new Error(`${request} must be normalized as local food.`);
  }
}
if (isLocalSenegaleseFoodRequest("Je veux rencontrer des Sénégalais")) {
  throw new Error("The word Sénégalais without a food context must not become local food.");
}
if (detectIntent("Ik wil geen pizza, gewoon een chilled drink.") !== "drink") {
  throw new Error("A negated pizza must not override the positive drink intent.");
}
if (detectIntent("Waar kan ik rustig werken met de airco?") !== "work") {
  throw new Error("A request for a quiet place to work must stay inside OFFSCRIPT scope.");
}
if (mergeIntent("Waar kan ik rustig werken met de airco?", undefined, "unknown") !== "work") {
  throw new Error("Deterministic work intent must override an unclear AI interpretation.");
}
if (resolveRequestedSubcategory("Waar kan ik rustig werken met de airco?", "air conditioning", undefined, [], false) !== "working") {
  throw new Error("Working must override an AI-generated air-conditioning subcategory.");
}
if (JSON.stringify(inferRequestedAmenities("Waar kan ik rustig werken met airco, wifi en stopcontacten?")) !== JSON.stringify(["air_conditioning", "wifi", "power_outlets"])) {
  throw new Error("Explicit workplace facilities must be extracted as normalized amenities.");
}
if (
  JSON.stringify(inferRequestedAmenities(
    "Ik zoek een rolstoeltoegankelijk terras met parking, een zwembad en alcoholvrije opties."
  )) !== JSON.stringify([
    "outdoor_seating",
    "swimming_pool",
    "parking",
    "wheelchair_accessible",
    "alcohol_free_options"
  ])
) {
  throw new Error("Extended verified facilities must be extracted as normalized amenities.");
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
const budgetPizza = {
  ...semanticTestPlace,
  id: "budget-pizza",
  name: "Anima Pizzeria",
  offscriptPickLevel: 3,
  offscriptPriority: 100,
  priceLevel: 1,
  audienceTags: []
} as unknown as Place;
const chicPizza = {
  ...semanticTestPlace,
  id: "chic-pizza",
  name: "Pizzammore",
  offscriptPickLevel: 0,
  offscriptPriority: 0,
  priceLevel: 4,
  audienceTags: []
} as unknown as Place;
if (
  selectBestPlace(
    [budgetPizza, chicPizza],
    { language: "nl", intent: "food", requestedSubcategory: "pizza", budget: "upscale" }
  )?.place.name !== "Pizzammore"
) {
  throw new Error("An explicit chic pizza request must outrank editorial priority and select the upscale place.");
}
if (
  selectBestPlace(
    [budgetPizza, chicPizza],
    { language: "nl", intent: "food", requestedSubcategory: "pizza", budget: "luxury" }
  )?.place.name !== "Pizzammore"
) {
  throw new Error("A luxury request without a luxury match must fall back to the chic place.");
}
const japaneseContext: UserContext = {
  language: "en",
  intent: "food",
  requestedSubcategory: "japanese",
  clarificationCount: 0
};
const japanesePlace = {
  ...semanticTestPlace,
  name: "Tokyo Yo",
  region: "Dakar",
  neighbourhood: "Almadies",
  subcategories: [{ id: "japanese", name: "Japanese", displayOrder: 1, images: [] }],
  audienceTags: [],
  occasionTags: [],
  travellerTypes: [],
  amenities: [],
  images: []
} as unknown as Place;
if (needsClarification(japaneseContext, [japanesePlace]) !== "location") {
  throw new Error("A single database match must still ask for the traveller's location before recommending it.");
}
const secondJapanesePlace = {
  ...japanesePlace,
  id: "second-japanese-place",
  name: "Second Japanese place",
  neighbourhood: "Plateau"
} as Place;
if (needsClarification(japaneseContext, [japanesePlace, secondJapanesePlace]) !== "location") {
  throw new Error("Several matches in different areas should ask for location.");
}
if (
  needsClarification(
    { ...japaneseContext, targetRegion: "Dakar", clarificationCount: 1 },
    [japanesePlace, secondJapanesePlace]
  ) !== "budget"
) {
  throw new Error("Several city-wide matches should ask for budget after mobility is known.");
}
if (
  needsClarification(
    {
      language: "nl",
      targetRegion: "Yoff",
      intent: "food",
      requestedStyle: "local",
      clarificationCount: 1
    },
    [
      { ...japanesePlace, id: "local-food-1", name: "Local food 1", neighbourhood: "Yoff" },
      { ...japanesePlace, id: "local-food-2", name: "Local food 2", neighbourhood: "Yoff" }
    ]
  ) !== null
) {
  throw new Error("Local food must be recommended after the neighbourhood is known, without a budget question.");
}
if (/quick|casual|local|romantic/i.test(buildClarifyingQuestion("budget", japaneseContext))) {
  throw new Error("The budget question must not fall back to the former broad style questionnaire.");
}
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
const beachCocktailMessage = "Waar kan ik een cocktail drinken aan het strand bij sunset?";
const beachCocktailContext: UserContext = {
  language: "nl",
  intent: detectIntent(beachCocktailMessage),
  requestedSubcategory: inferRequestedSubcategory(beachCocktailMessage),
  timing: inferTiming(beachCocktailMessage),
  vibe: inferTextVibe(beachCocktailMessage),
  directRequest: true
};
if (
  beachCocktailContext.intent !== "drink" ||
  beachCocktailContext.requestedSubcategory !== "beach" ||
  beachCocktailContext.timing !== "sunset"
) {
  throw new Error(
    `Cocktail beach sunset context mismatch: ${JSON.stringify(beachCocktailContext)}`
  );
}
const sunsetCocktailPlace = {
  ...beachReggaePlace,
  name: "Sunset beach cocktails",
  area: "Beachfront",
  occasionTags: ["drinks", "beach_day", "sunset"],
  vibe: "Sunset ocean view",
  vibeTags: ["sunset"]
} as unknown as Place;
if (selectBestPlace([sunsetCocktailPlace], beachCocktailContext)?.place.name !== "Sunset beach cocktails") {
  throw new Error("A cocktail-at-the-beach sunset request must produce a matching recommendation.");
}
const workFriendlyPlace = {
  ...beachReggaePlace,
  name: "Quiet workspace",
  categories: ["food"],
  subcategories: [{ id: "cafe", name: "Café", displayOrder: 1, images: [] }],
  vibe: "Calm",
  vibeTags: ["calm"],
  occasionTags: ["working"],
  amenities: ["air_conditioning", "wifi"],
  workFriendly: true
} as unknown as Place;
const workContext: UserContext = {
  language: "nl",
  intent: "work",
  requestedSubcategory: "working",
  requestedAmenities: ["air_conditioning"],
  vibe: "calm",
  directRequest: true
};
if (selectBestPlace([workFriendlyPlace], workContext)?.place.name !== "Quiet workspace") {
  throw new Error("A quiet work request must select a work-friendly place.");
}
if (placePassesHardConstraints({ ...workFriendlyPlace, amenities: ["wifi"] } as Place, workContext)) {
  throw new Error("A place without an explicitly requested amenity must be excluded.");
}
const coffeeSearchProfile = {
  activity: "drink" as const,
  products: ["coffee"],
  locationFeatures: [],
  occasions: [],
  vibes: [],
  amenities: [],
  dietaryRequirements: [],
  exclusions: { products: [], categories: [], audienceTags: [], dietary: [] }
};
const agriculturalPowderShop = {
  ...beachReggaePlace,
  name: "Agricultural powder shop",
  shortDescription: "Natural fruit, coffee and plant powders that can be added to drinks.",
  categories: ["shopping", "bar"],
  subcategories: [
    { id: "products", name: "Natural products", displayOrder: 1, images: [] },
    { id: "coffee", name: "Café", description: "Coffee powder", displayOrder: 2, images: [] }
  ],
  occasionTags: ["drinks"]
} as unknown as Place;
const documentedCoffeeBar = {
  ...beachReggaePlace,
  name: "Documented coffee bar",
  shortDescription: "A neighbourhood café known for freshly made coffee.",
  categories: ["food_and_drink"],
  subcategories: [{ id: "bar", name: "Bar", displayOrder: 1, images: [] }],
  occasionTags: ["drinks"]
} as unknown as Place;
if (placePassesSearchProfileHardConstraints(agriculturalPowderShop, coffeeSearchProfile)) {
  throw new Error("A generic drink-related shop must never satisfy an explicit coffee request.");
}
if (!placePassesSearchProfileHardConstraints(documentedCoffeeBar, coffeeSearchProfile)) {
  throw new Error("A place with documented coffee must satisfy an explicit coffee request.");
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
        recognisesWebsiteTuutiStart: isOffscriptStartMessage("Bonjour TUUTI 👋"),
        recognisesTuutiStart: isOffscriptStartMessage("Start TUUTI 👋"),
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
