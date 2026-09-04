import { getOpenAIClient, hasOpenAIKey, openaiModel } from "../integrations/openai.js";
import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";

type GeneratePlaceFollowUpReplyInput = {
  message: string;
  language: string;
  place: Place;
  needs: UserContext;
};

const PLACE_FOLLOW_UP_TIMEOUT_MS = 5_000;

const languageName = (language: string): string => {
  if (language.startsWith("nl")) return "Dutch";
  if (language.startsWith("fr")) return "French";
  if (language.startsWith("de")) return "German";
  return "British English";
};

function unknownFactReply(placeName: string, language: string): string {
  if (language.startsWith("nl")) {
    return `Dat kan ik op basis van mijn informatie over ${placeName} niet met zekerheid zeggen.`;
  }
  if (language.startsWith("fr")) {
    return `Je ne peux pas le confirmer avec certitude à partir de mes informations sur ${placeName}.`;
  }
  if (language.startsWith("de")) {
    return `Das kann ich anhand meiner Informationen zu ${placeName} nicht sicher bestätigen.`;
  }
  return `I cannot confirm that with certainty from my information about ${placeName}.`;
}

export async function generatePlaceFollowUpReply(
  input: GeneratePlaceFollowUpReplyInput
): Promise<string> {
  if (!hasOpenAIKey()) return unknownFactReply(input.place.name, input.language);

  try {
    const response = await getOpenAIClient().responses.create({
      model: openaiModel,
      instructions: `You answer a follow-up about the active OFFSCRIPT recommendation or a dish, drink, activity, cultural concept, neighbourhood or other topic mentioned in it. The answer remains grounded in the traveller needs captured when the place was recommended.

Answer the user's actual question directly in ${languageName(input.language)}.
For claims about the recommended place, use only facts contained in the supplied place object. You may explain established general knowledge about a mentioned dish, drink, activity, cultural concept or neighbourhood, but never invent a connection to the place.
When asked why the place was chosen or whether it fits, explicitly connect supported place facts to the supplied traveller needs. Do not claim a fit that the place data does not support.
When natural, end by briefly reconnecting the explanation to the active place using a supported fact from the place object. This should feel like conversational continuity, not a repeated recommendation.
Never recommend, compare or mention another place.
Do not restart the search and do not repeat the full recommendation.
If the requested fact is not supported by the supplied data, say briefly that OFFSCRIPT cannot confirm it.
Sound like a warm, knowledgeable local friend, not a database, intake form or travel brochure.
For an ordinary factual question, answer in one to three sentences.
When the user asks for the story, history, origin or background, tell the supported story naturally in four to seven flowing sentences. Focus on the human thread and the most memorable concrete details instead of mechanically summarizing fields.`,
      input: JSON.stringify({
        userMessage: input.message,
        travellerNeeds: input.needs,
        place: input.place
      })
    }, {
      timeout: PLACE_FOLLOW_UP_TIMEOUT_MS
    });

    return response.output_text.trim() || unknownFactReply(input.place.name, input.language);
  } catch (error) {
    console.error("Place follow-up reply failed", error);
    return unknownFactReply(input.place.name, input.language);
  }
}
