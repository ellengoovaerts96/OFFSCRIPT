import { getConversationContext, upsertConversationContext } from "../data/conversationContextRepository.js";
import { listRecommendationPlaces } from "../data/placesRepository.js";
import type { UserContext } from "../types/userContext.js";
import { findKnownRegion } from "../utils/normalizeRegion.js";
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

function inferContextFromMessage(message: string, previousContext: UserContext | null): UserContext {
  const lower = message.toLowerCase();
  const targetRegion = findKnownRegion(message) ?? previousContext?.targetRegion;

  return {
    language: previousContext?.language ?? "en",
    ...previousContext,
    targetRegion,
    travellerType: lower.includes("friends") || lower.includes("vrienden") ? "friends" : previousContext?.travellerType,
    hasChildren:
      lower.includes("no children") || lower.includes("geen kinderen")
        ? false
        : lower.includes("children") || lower.includes("kinderen")
          ? true
          : previousContext?.hasChildren,
    intent: lower.includes("culture") || lower.includes("cultuur") ? "culture" : previousContext?.intent,
    timing:
      lower.includes("morning") || lower.includes("ochtend")
        ? "morning"
        : lower.includes("afternoon") || lower.includes("middag")
          ? "afternoon"
          : lower.includes("tonight") || lower.includes("vanavond") || lower.includes("evening") || lower.includes("avond")
            ? "evening"
            : previousContext?.timing
  };
}

export async function runChatbotFlow(userPhone: string, message: string): Promise<ChatbotFlowResult> {
  const previousContext = await getConversationContext(userPhone);
  const context = inferContextFromMessage(message, previousContext);

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
      message: "I do not have a strong OFFSCRIPT match for that yet. Tell me a bit more and I will try with what I do know."
    };
  }

  return {
    type: "recommendation",
    context,
    placeName: selection.place.name,
    score: selection.score,
    message: `${selection.place.name} fits best here. ${selection.place.shortDescription}\n\nMap: ${selection.place.googleMapsUrl}`
  };
}
