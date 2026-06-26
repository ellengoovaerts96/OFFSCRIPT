import { buildUserContext } from "../ai/buildUserContext.js";
import { detectLanguage, detectRequestedLanguage } from "../ai/detectLanguage.js";
import { generateAnswer } from "../ai/generateAnswer.js";
import {
  deleteConversationContext,
  getConversationContext,
  upsertConversationContext
} from "../data/conversationContextRepository.js";
import { listRecommendationPlaces } from "../data/placesRepository.js";
import { buildRetrievedFacts } from "../data/retrievalRepository.js";
import { findStoryKnowledgeMatch } from "../data/storiesRepository.js";
import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { buildClarifyingQuestion } from "./buildClarifyingQuestion.js";
import { buildGreetingResponse, isGreetingOnly } from "./greeting.js";
import { needsClarification } from "./needsClarification.js";
import { selectBestAlternativePlace, selectBestPlace } from "./selectBestPlace.js";
import { findKnownRegion, normalizeRegion } from "../utils/normalizeRegion.js";

export type ChatbotFlowResult =
  | {
      type: "clarification";
      context: UserContext;
      message: string;
    }
  | {
      type: "recommendation";
      context: UserContext;
      placeName: string;
      score: number;
      message: string;
      imageUrls: string[];
    }
  | {
      type: "no_match";
      context: UserContext;
      message: string;
    }
  | {
      type: "story";
      context: UserContext;
      storySlug: string;
      message: string;
    };

function buildNoMatchResponse(context: UserContext): string {
  const location = context.targetRegion ?? context.currentLocation;

  if (context.language?.startsWith("nl")) {
    if (location) {
      return `Ik heb nog geen sterke OFFSCRIPT-match in ${location}. Wil je naar een andere buurt in Dakar gaan? Dan kan ik breder zoeken.`;
    }

    return "Ik heb daar nog geen sterke OFFSCRIPT-match voor. Vertel me waar je bent en welke vibe je zoekt, dan probeer ik met wat ik wel al weet.";
  }

  if (context.language?.startsWith("fr")) {
    if (location) {
      return `Je n’ai pas encore de match OFFSCRIPT vraiment solide à ${location}. Est-ce que tu veux te déplacer dans un autre quartier de Dakar ? Je peux chercher plus largement.`;
    }

    return "Je n’ai pas encore de match OFFSCRIPT vraiment solide pour ça. Dis-moi où tu es et l’ambiance que tu cherches, et j’essaie avec ce que j’ai.";
  }

  if (context.language?.startsWith("de")) {
    if (location) {
      return `Ich habe noch keinen starken OFFSCRIPT-Match in ${location}. Wärst du offen für ein anderes Viertel in Dakar? Dann kann ich breiter suchen.`;
    }

    return "Ich habe dafür noch keinen starken OFFSCRIPT-Match. Sag mir, wo du bist und welche Stimmung du suchst, dann versuche ich es mit dem, was ich habe.";
  }

  if (location) {
    return `I do not have a strong OFFSCRIPT match in ${location} yet. Would you be open to another Dakar neighbourhood? I can search more broadly.`;
  }

  return "I do not have a strong OFFSCRIPT match for that yet. Tell me where you are and what kind of vibe you want, and I will try with what I do have.";
}

function buildLanguagePreferenceResponse(context: UserContext): string {
  const missingField = needsClarification(context);

  const acknowledgement = context.language.startsWith("nl")
    ? "Helemaal, ik antwoord vanaf nu in het Nederlands."
    : context.language.startsWith("fr")
      ? "Bien sûr, je réponds en français à partir de maintenant."
      : context.language.startsWith("de")
        ? "Gerne, ich antworte ab jetzt auf Deutsch."
        : "Of course, I will answer in English from now on.";

  return missingField
    ? `${acknowledgement} ${buildClarifyingQuestion(missingField, context)}`
    : acknowledgement;
}

function containsObjectifyingSocialRequest(message: string): boolean {
  const normalized = normalizeSearchText(message);

  return [
    "my dick",
    "me and my dick",
    "hard dick",
    "dick",
    "my cock",
    "cock",
    "pussy",
    "sex",
    "hookup",
    "hook up",
    "get laid",
    "stijve",
    "mijn pik",
    "pik",
    "seks",
    "neuken",
    "beautiful girls",
    "hot girls",
    "pretty girls",
    "belles filles",
    "jolies filles",
    "filles chaudes",
    "mooie meisjes",
    "knappe meisjes",
    "mooie vrouwen",
    "knappe vrouwen"
  ].some((phrase) => normalized.includes(normalizeSearchText(phrase)));
}

function buildRespectfulSocialResponse(context: UserContext): string {
  const location = context.targetRegion ?? context.currentLocation;

  if (context.language.startsWith("nl")) {
    return location
      ? `Ik kan je niet helpen zoeken naar vrouwen of meisjes. Wel kan ik respectvolle sociale plekken in ${location} aanraden, zoals een bar, live music of een plek om te dansen. Wil je eerder iets rustig, lokaal of nightlife?`
      : "Ik kan je niet helpen zoeken naar vrouwen of meisjes. Wel kan ik respectvolle sociale plekken aanraden, zoals een bar, live music of een plek om te dansen. In welke buurt ben je?";
  }

  if (context.language.startsWith("fr")) {
    return location
      ? `Je ne peux pas t’aider à chercher des femmes ou des filles. Par contre, je peux te recommander des lieux sociaux et respectueux à ${location}, comme un bar, de la musique live ou un endroit pour danser. Tu préfères une ambiance calme, locale ou plutôt nightlife ?`
      : "Je ne peux pas t’aider à chercher des femmes ou des filles. Par contre, je peux te recommander des lieux sociaux et respectueux, comme un bar, de la musique live ou un endroit pour danser. Tu es dans quel quartier ?";
  }

  if (context.language.startsWith("de")) {
    return location
      ? `Ich kann dir nicht dabei helfen, Frauen oder Mädchen zu suchen. Ich kann dir aber respektvolle soziale Orte in ${location} empfehlen, zum Beispiel eine Bar, Live-Musik oder einen Ort zum Tanzen. Suchst du eher ruhig, lokal oder Nightlife?`
      : "Ich kann dir nicht dabei helfen, Frauen oder Mädchen zu suchen. Ich kann dir aber respektvolle soziale Orte empfehlen, zum Beispiel eine Bar, Live-Musik oder einen Ort zum Tanzen. In welchem Viertel bist du?";
  }

  return location
    ? `I cannot help you look for women or girls. I can help with respectful social places in ${location}, like a bar, live music or somewhere to dance. Do you want something calm, local or more nightlife?`
    : "I cannot help you look for women or girls. I can help with respectful social places, like a bar, live music or somewhere to dance. Which neighbourhood are you in?";
}

function placeArea(place: Place): string {
  return place.neighbourhood ?? place.region;
}

function buildAlternativeIntro(context: UserContext, place: Place): string {
  const requestedLocation = context.targetRegion ?? context.currentLocation;
  const alternativeLocation = placeArea(place);

  if (context.language?.startsWith("nl")) {
    return requestedLocation
      ? `Ik heb nog geen sterke OFFSCRIPT-match in ${requestedLocation}, maar wel een goede optie in ${alternativeLocation}: `
      : "";
  }

  if (context.language?.startsWith("fr")) {
    return requestedLocation
      ? `Je n’ai pas encore de match OFFSCRIPT vraiment solide à ${requestedLocation}, mais j’ai une bonne option à ${alternativeLocation} : `
      : "";
  }

  if (context.language?.startsWith("de")) {
    return requestedLocation
      ? `Ich habe noch keinen starken OFFSCRIPT-Match in ${requestedLocation}, aber eine gute Option in ${alternativeLocation}: `
      : "";
  }

  return requestedLocation
    ? `I do not have a strong OFFSCRIPT match in ${requestedLocation} yet, but I do have a good option in ${alternativeLocation}: `
    : "";
}

function isResetCommand(message: string): boolean {
  return /^(?:reset|opnieuw beginnen|begin opnieuw|start opnieuw|restart|start over)[!,.?\s]*$/i.test(
    message.trim()
  );
}

const SUBCATEGORY_ALIASES: Record<string, string[]> = {
  jewellery: ["jewellery", "jewelry", "juwelen", "juweel", "sieraden", "bijoux"],
  wood: ["wood", "woodwork", "hout", "houten", "bois"],
  artworks: ["artworks", "art", "kunst", "kunstwerken", "artwork", "oeuvres", "œuvres"],
  handbags: ["handbags", "bags", "bag", "handtassen", "handtas", "tassen", "sacs", "sac"]
};

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function subcategoryMatchesMessage(subcategoryName: string, message: string): boolean {
  const normalizedMessage = normalizeSearchText(message);
  const normalizedName = normalizeSearchText(subcategoryName);
  const aliases = SUBCATEGORY_ALIASES[normalizedName] ?? [normalizedName];

  return aliases.some((alias) => normalizedMessage.includes(normalizeSearchText(alias)));
}

function selectRecommendationImages(place: Place, message: string): string[] {
  const matchingSubcategoryImages = place.subcategories
    .filter((subcategory) => subcategoryMatchesMessage(subcategory.name, message))
    .flatMap((subcategory) => subcategory.images.map((image) => image.url));

  const imageUrls = [
    ...matchingSubcategoryImages,
    ...place.images.map((image) => image.url),
    ...place.subcategories.flatMap((subcategory) => subcategory.images.map((image) => image.url))
  ];

  return Array.from(new Set(imageUrls)).slice(0, 2);
}

export async function runChatbotFlow(userPhone: string, message: string): Promise<ChatbotFlowResult> {
  if (isResetCommand(message)) {
    const context: UserContext = {
      language: detectLanguage(message)
    };

    await deleteConversationContext(userPhone);
    await upsertConversationContext(userPhone, context);

    return {
      type: "clarification",
      context,
      message: buildGreetingResponse(context)
    };
  }

  if (isGreetingOnly(message)) {
    const context: UserContext = {
      ...(await getConversationContext(userPhone)),
      language: detectLanguage(message)
    };

    await upsertConversationContext(userPhone, context);

    return {
      type: "clarification",
      context,
      message: buildGreetingResponse(context)
    };
  }

  const previousContext = await getConversationContext(userPhone);
  const requestedLanguage = detectRequestedLanguage(message);
  const storyLanguage = requestedLanguage ?? detectLanguage(message, previousContext?.language ?? "en");
  const knownRegion = findKnownRegion(message);
  const storyMatch = await findStoryKnowledgeMatch(message, storyLanguage);

  if (storyMatch) {
    const context: UserContext = {
      ...previousContext,
      language: storyLanguage
    };

    await upsertConversationContext(userPhone, context);

    return {
      type: "story",
      context,
      storySlug: storyMatch.slug,
      message: `${storyMatch.shortWhatsappReply}\n\n👉 ${storyMatch.url}`
    };
  }

  if (requestedLanguage) {
    const context: UserContext = {
      ...previousContext,
      language: requestedLanguage
    };

    await upsertConversationContext(userPhone, context);

    return {
      type: "clarification",
      context,
      message: buildLanguagePreferenceResponse(context)
    };
  }

  if (containsObjectifyingSocialRequest(message)) {
    const context: UserContext = {
      ...previousContext,
      language: storyLanguage,
      targetRegion: normalizeRegion(knownRegion ?? previousContext?.targetRegion),
      intent: "nightlife"
    };

    await upsertConversationContext(userPhone, context);

    return {
      type: "clarification",
      context,
      message: buildRespectfulSocialResponse(context)
    };
  }

  const { context } = await buildUserContext({
    message,
    previousContext
  });

  await upsertConversationContext(userPhone, context);

  const missingField = needsClarification(context);
  if (missingField) {
    return {
      type: "clarification",
      context,
      message:
        missingField === "travellerType"
          ? buildGreetingResponse(context)
          : buildClarifyingQuestion(missingField, context)
    };
  }

  const places = await listRecommendationPlaces();
  const selection = selectBestPlace(places, context);

  if (!selection) {
    const alternativeSelection = selectBestAlternativePlace(places, context);

    if (alternativeSelection) {
      const retrievedFacts = await buildRetrievedFacts({
        context,
        alternativePlace: alternativeSelection.place
      });
      const messageText = await generateAnswer({
        userMessage: message,
        context,
        selectedPlace: alternativeSelection.place,
        retrievedFacts
      });

      return {
        type: "recommendation",
        context,
        placeName: alternativeSelection.place.name,
        score: alternativeSelection.score,
        message: `${buildAlternativeIntro(context, alternativeSelection.place)}${messageText}`,
        imageUrls: selectRecommendationImages(alternativeSelection.place, message)
      };
    }

    return {
      type: "no_match",
      context,
      message: buildNoMatchResponse(context)
    };
  }

  const retrievedFacts = await buildRetrievedFacts({
    context,
    selectedPlace: selection.place
  });
  const messageText = await generateAnswer({
    userMessage: message,
    context,
    selectedPlace: selection.place,
    retrievedFacts
  });

  return {
    type: "recommendation",
    context,
    placeName: selection.place.name,
    score: selection.score,
    message: messageText,
    imageUrls: selectRecommendationImages(selection.place, message)
  };
}

export async function handleChatMessage(input: {
  userPhone: string;
  message: string;
}): Promise<{ reply: string; imageUrls: string[] }> {
  const result = await runChatbotFlow(input.userPhone, input.message);
  return {
    reply: result.message,
    imageUrls: result.type === "recommendation" ? result.imageUrls : []
  };
}
