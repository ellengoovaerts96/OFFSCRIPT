import { getOpenAIClient, hasOpenAIKey, openaiModel } from "../integrations/openai.js";
import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { systemPrompt } from "./systemPrompt.js";

export type GenerateAnswerInput = {
  userMessage: string;
  context: UserContext;
  selectedPlace: Place;
};

function buildPlaceFacts(place: Place): Record<string, unknown> {
  return {
    name: place.name,
    region: place.region,
    neighbourhood: place.neighbourhood,
    categories: place.categories,
    subcategories: place.subcategories.map((subcategory) => ({
      name: subcategory.name,
      description: subcategory.description,
      imageCount: subcategory.images.length
    })),
    shortDescription: place.shortDescription,
    personalTip: place.personalTip,
    whyHiddenGem: place.whyHiddenGem,
    bestFor: place.bestFor,
    childFriendly: place.childFriendly,
    childNotes: place.childNotes,
    bestTiming: place.bestTiming,
    openingHours: place.openingHours,
    priceLevel: place.priceLevel,
    reservationNeeded: place.reservationNeeded,
    reservationMethod: place.reservationMethod,
    reservationPhone: place.reservationPhone,
    reservationUrl: place.reservationUrl,
    transportNotes: place.transportNotes,
    taxiNotes: place.taxiNotes,
    safetyNotes: place.safetyNotes,
    guideAvailable: place.guideAvailable,
    guideName: place.guideName,
    guidePhone: place.guidePhone
  };
}

function fallbackAnswer(input: GenerateAnswerInput): string {
  const place = input.selectedPlace;
  const notes = [
    place.personalTip ? `Tip: ${place.personalTip}` : undefined,
    place.reservationNeeded ? "Reservation is recommended here." : undefined,
    place.transportNotes,
    place.safetyNotes ? `Safety note: ${place.safetyNotes}` : undefined
  ].filter(Boolean);

  return [
    `I would send you to ${place.name}. ${place.shortDescription}`,
    ...notes
  ].join("\n\n");
}

export async function generateAnswer(input: GenerateAnswerInput): Promise<string> {
  if (!hasOpenAIKey()) {
    return fallbackAnswer(input);
  }

  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: openaiModel,
    instructions: `${systemPrompt}

Write one warm, concise WhatsApp recommendation.
Use only the provided selectedPlace facts.
Maximum 3 short sentences.
Include the place name, why it fits, and at most one useful tip.
Do not include a Google Maps link or any URL.
Omit missing facts. Do not invent anything.`,
    input: JSON.stringify({
      userMessage: input.userMessage,
      context: input.context,
      selectedPlace: buildPlaceFacts(input.selectedPlace)
    })
  });

  return response.output_text.trim() || fallbackAnswer(input);
}
