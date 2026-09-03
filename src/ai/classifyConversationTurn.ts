import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient, hasOpenAIKey, openaiModel } from "../integrations/openai.js";

type ClassifyConversationTurnInput = {
  message: string;
  previousAssistantMessage?: string | null;
};

const classificationSchema = z.object({
  route: z.enum(["database_flow", "conversation_boundary"])
});

const CLASSIFICATION_TIMEOUT_MS = 2_500;

function isClearConversationalDetour(message: string): boolean {
  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(?:ha){2,}|^(?:haha)+$|^lol+$|^mdr+$|^lmao+$/.test(normalized)) return true;
  return /\b(?:logo|website|site)\b/.test(normalized) &&
    /\b(?:mooi|sterk|leuk|tof|prachtig|joli|beau|belle|super|nice|great|cool)\b/.test(normalized);
}

export async function shouldUseConversationBoundary(
  input: ClassifyConversationTurnInput
): Promise<boolean> {
  if (isClearConversationalDetour(input.message)) return true;
  if (!hasOpenAIKey()) return false;

  try {
    const response = await getOpenAIClient().responses.parse({
      model: openaiModel,
      instructions: `Route the user's newest WhatsApp message for TUUTI, a curated Senegal travel assistant.

Choose database_flow when the message:
- asks for a place, activity, food, drink, neighbourhood, experience or practical travel help in Senegal;
- supplies a preference or constraint that can help select a database place;
- is a plausible answer to the previous TUUTI question, even when it is short, informal, an emoji, yes/no, a neighbourhood, time, group type, budget or atmosphere.

Choose conversation_boundary when the message:
- is laughter, teasing, idle banter, nonsense or unrelated small talk;
- asks for something outside TUUTI's Senegal travel purpose;
- comments on TUUTI itself without supplying travel-search information.

Use the recent conversation to interpret short replies. Do not route a meaningless reply into the database merely because an older travel preference remains in history. Return only the structured classification.`,
      input: JSON.stringify({
        previousAssistantMessage: input.previousAssistantMessage ?? null,
        userMessage: input.message
      }),
      text: {
        format: zodTextFormat(classificationSchema, "conversation_route")
      }
    }, {
      timeout: CLASSIFICATION_TIMEOUT_MS
    });

    return response.output_parsed?.route === "conversation_boundary";
  } catch (error) {
    console.error("Conversation routing failed; continuing with database flow", error);
    return false;
  }
}
