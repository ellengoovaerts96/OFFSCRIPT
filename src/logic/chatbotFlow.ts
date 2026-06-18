import { buildUserContext } from "../ai/buildUserContext.js";
import { generateAnswer } from "../ai/generateAnswer.js";
import { getConversationContext, upsertConversationContext } from "../data/conversationContextRepository.js";
import { listRecommendationPlaces } from "../data/placesRepository.js";
import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { buildClarifyingQuestion } from "./buildClarifyingQuestion.js";
import { buildGreetingResponse, isGreetingOnly } from "./greeting.js";
import { needsClarification } from "./needsClarification.js";
import { selectBestPlace } from "./selectBestPlace.js";

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
    };

function buildNoMatchResponse(context: UserContext): string {
  if (context.language?.startsWith("nl")) {
    return "Ik heb daar nog geen sterke OFFSCRIPT-match voor. Vertel me waar je bent en welke vibe je zoekt, dan probeer ik met wat ik wel al weet.";
  }

  if (context.language?.startsWith("fr")) {
    return "Je n’ai pas encore de match OFFSCRIPT vraiment solide pour ça. Dis-moi où tu es et l’ambiance que tu cherches, et j’essaie avec ce que j’ai.";
  }

  return "I do not have a strong OFFSCRIPT match for that yet. Tell me where you are and what kind of vibe you want, and I will try with what I do have.";
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
  const previousContext = await getConversationContext(userPhone);
  const { context } = await buildUserContext({
    message,
    previousContext
  });

  await upsertConversationContext(userPhone, context);

  if (isGreetingOnly(message)) {
    return {
      type: "clarification",
      context,
      message: buildGreetingResponse(context)
    };
  }

  const missingField = needsClarification(context);
  if (missingField) {
    return {
      type: "clarification",
      context,
      message: buildClarifyingQuestion(missingField, context)
    };
  }

  const places = await listRecommendationPlaces();
  const selection = selectBestPlace(places, context);

  if (!selection) {
    return {
      type: "no_match",
      context,
      message: buildNoMatchResponse(context)
    };
  }

  const messageText = await generateAnswer({
    userMessage: message,
    context,
    selectedPlace: selection.place
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
