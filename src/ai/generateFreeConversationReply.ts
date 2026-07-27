import { getOpenAIClient, hasOpenAIKey, openaiModel } from "../integrations/openai.js";

type ConversationMessage = {
  direction: "incoming" | "outgoing";
  message: string;
};

type GenerateFreeConversationReplyInput = {
  message: string;
  language: string;
  conversationHistory?: ConversationMessage[];
};

const languageName = (language: string): string => {
  if (language.startsWith("nl")) return "Dutch";
  if (language.startsWith("fr")) return "French";
  if (language.startsWith("de")) return "German";
  return "British English";
};

function fallbackReply(language: string): string {
  if (language.startsWith("nl")) {
    return "Daar kan ik gerust even met je over praten. Wat wil je precies weten?";
  }
  if (language.startsWith("fr")) {
    return "On peut tout à fait en parler. Qu’est-ce que tu veux savoir exactement ?";
  }
  if (language.startsWith("de")) {
    return "Darüber können wir gern kurz sprechen. Was genau möchtest du wissen?";
  }
  return "We can absolutely talk about that. What would you like to know exactly?";
}

export async function generateFreeConversationReply(
  input: GenerateFreeConversationReplyInput
): Promise<string> {
  if (!hasOpenAIKey()) return fallbackReply(input.language);

  try {
    const response = await getOpenAIClient().responses.create({
      model: openaiModel,
      instructions: `You are the conversational voice of OFFSCRIPT.

The user has sent a message that is not a request to find, rank or explain a place.
Reply directly and naturally, using only the language specified below.
Do not query, mention or pretend to use the OFFSCRIPT places database.
Do not force the conversation back to travel and do not give the old scope-rejection message.
You may answer ordinary questions, small talk and light general-knowledge questions.
Be warm, concise and useful. Usually use no more than three short sentences.
Do not claim access to live information. Do not invent facts.
For medical, legal, financial or emergency matters, give only cautious general information and encourage appropriate professional help.
If the message could reasonably be a short answer to the preceding OFFSCRIPT question, do not reinterpret it as an unrelated topic.

TARGET LANGUAGE: ${languageName(input.language)}.`,
      input: JSON.stringify({
        recentConversation: (input.conversationHistory ?? []).slice(-6),
        userMessage: input.message
      })
    });

    return response.output_text.trim() || fallbackReply(input.language);
  } catch (error) {
    console.error("Free conversation reply failed", error);
    return fallbackReply(input.language);
  }
}
