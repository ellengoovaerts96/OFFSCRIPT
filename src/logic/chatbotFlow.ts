import { buildUserContext } from "../ai/buildUserContext.js";
import { generateAnswer } from "../ai/generateAnswer.js";
import { getConversationContext, upsertConversationContext } from "../data/conversationContextRepository.js";
import { listRecommendationPlaces } from "../data/placesRepository.js";
import type { UserContext } from "../types/userContext.js";
import { buildClarifyingQuestion } from "./buildClarifyingQuestion.js";
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

export async function runChatbotFlow(userPhone: string, message: string): Promise<ChatbotFlowResult> {
  const previousContext = await getConversationContext(userPhone);
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
    message: messageText
  };
}

export async function handleChatMessage(input: { userPhone: string; message: string }): Promise<{ reply: string }> {
  const result = await runChatbotFlow(input.userPhone, input.message);
  return { reply: result.message };
}
