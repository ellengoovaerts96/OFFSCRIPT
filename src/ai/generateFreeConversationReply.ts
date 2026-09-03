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
    return "Haha, ik hoor je 😄 Ik blijf wel bij waar TUUTI goed in is: bijzondere plekken en ervaringen in Senegal. Zeg maar waar je zin in hebt, dan help ik je graag.";
  }
  if (language.startsWith("fr")) {
    return "Haha, je te suis 😄 Mais je reste dans ce que TUUTI fait vraiment bien : les belles adresses et expériences au Sénégal. Dis-moi ce qui te ferait plaisir et je t’aide volontiers.";
  }
  if (language.startsWith("de")) {
    return "Haha, verstanden 😄 Ich bleibe aber bei dem, was TUUTI wirklich gut kann: besondere Orte und Erlebnisse im Senegal. Sag mir, worauf du Lust hast, dann helfe ich dir gern.";
  }
  return "Haha, I hear you 😄 I will stay with what TUUTI does really well: special places and experiences in Senegal. Tell me what you feel like doing and I will gladly help.";
}

export async function generateFreeConversationReply(
  input: GenerateFreeConversationReplyInput
): Promise<string> {
  if (!hasOpenAIKey()) return fallbackReply(input.language);

  try {
    const response = await getOpenAIClient().responses.create({
      model: openaiModel,
      instructions: `You are the conversational voice of TUUTI.

The user has sent laughter, banter, nonsense, an unrelated request or another message outside TUUTI's purpose.
Reply directly and naturally, using only the language specified below.
First acknowledge the actual meaning and tone of the user's message, so the reply never feels generic or scolding.
Then explain gently that TUUTI focuses on carefully selected places and experiences in Senegal, and invite one relevant travel preference.
Do not answer unrelated general-knowledge requests and do not pretend to search the places database.
For harmless laughter or a compliment, respond lightly and warmly before redirecting; never lecture the user.
For offensive or unsafe content, set a calm boundary without repeating graphic wording.
Use the user's current brand name TUUTI, never OFFSCRIPT.
Be warm and concise: one or two short sentences.

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
