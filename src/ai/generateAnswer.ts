import { getOpenAIClient, hasOpenAIKey, openaiModel } from "../integrations/openai.js";
import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { systemPrompt } from "./systemPrompt.js";

export type GenerateAnswerInput = {
  userMessage: string;
  context: UserContext;
  selectedPlace: Place;
};

type SupportedAnswerLanguage = "nl" | "fr" | "en";

const languageNames: Record<SupportedAnswerLanguage, string> = {
  nl: "Dutch (Nederlands)",
  fr: "French (français)",
  en: "English"
};

const languageMarkers: Record<SupportedAnswerLanguage, string[]> = {
  nl: [
    "aan",
    "als",
    "bij",
    "dan",
    "dat",
    "de",
    "deze",
    "dit",
    "een",
    "en",
    "het",
    "hier",
    "ik",
    "in",
    "is",
    "je",
    "met",
    "naar",
    "om",
    "op",
    "voor"
  ],
  fr: [
    "avec",
    "ce",
    "cette",
    "dans",
    "de",
    "des",
    "est",
    "et",
    "ici",
    "je",
    "la",
    "le",
    "les",
    "pour",
    "que",
    "un",
    "une",
    "vous"
  ],
  en: [
    "a",
    "and",
    "as",
    "at",
    "for",
    "here",
    "i",
    "in",
    "is",
    "it",
    "of",
    "on",
    "that",
    "the",
    "this",
    "to",
    "with",
    "you"
  ]
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

function answerLanguage(language: string): SupportedAnswerLanguage {
  if (language.startsWith("nl")) return "nl";
  if (language.startsWith("fr")) return "fr";
  return "en";
}

function intentLabel(context: UserContext, language: SupportedAnswerLanguage): string | undefined {
  if (!context.intent || context.intent === "unknown") return undefined;

  const labels: Record<SupportedAnswerLanguage, Partial<Record<NonNullable<UserContext["intent"]>, string>>> = {
    nl: {
      food: "eten",
      drink: "iets drinken",
      culture: "cultuur",
      beach: "het strand",
      sports: "sport",
      nature: "natuur",
      nightlife: "uitgaan",
      shopping: "winkelen",
      stay: "een verblijf",
      guide: "een gids",
      reservation: "een reservatie"
    },
    fr: {
      food: "manger",
      drink: "boire un verre",
      culture: "la culture",
      beach: "la plage",
      sports: "le sport",
      nature: "la nature",
      nightlife: "sortir",
      shopping: "le shopping",
      stay: "un hébergement",
      guide: "un guide",
      reservation: "une réservation"
    },
    en: {
      food: "food",
      drink: "drinks",
      culture: "culture",
      beach: "the beach",
      sports: "sports",
      nature: "nature",
      nightlife: "nightlife",
      shopping: "shopping",
      stay: "a place to stay",
      guide: "a guide",
      reservation: "a reservation"
    }
  };

  return labels[language][context.intent];
}

function matchesLanguage(text: string, expectedLanguage: SupportedAnswerLanguage): boolean {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const scores = Object.fromEntries(
    Object.entries(languageMarkers).map(([language, markers]) => [
      language,
      words.filter((word) => markers.includes(word)).length
    ])
  ) as Record<SupportedAnswerLanguage, number>;
  const expectedScore = scores[expectedLanguage];
  const highestOtherScore = Math.max(
    ...Object.entries(scores)
      .filter(([language]) => language !== expectedLanguage)
      .map(([, score]) => score)
  );

  return expectedScore >= 2 && expectedScore >= highestOtherScore;
}

function fallbackAnswer(input: GenerateAnswerInput): string {
  const place = input.selectedPlace;
  const language = answerLanguage(input.context.language);
  const intent = intentLabel(input.context, language);

  if (language === "nl") {
    const fit = intent ? `Deze plek past goed als je zin hebt in ${intent}.` : "Deze plek past goed bij wat je zoekt.";
    const reservation = place.reservationNeeded ? "Ik raad aan om vooraf te reserveren." : undefined;
    return [`Ik zou je naar ${place.name} sturen.`, fit, reservation].filter(Boolean).join(" ");
  }

  if (language === "fr") {
    const fit = intent ? `Cet endroit te convient bien si tu cherches ${intent}.` : "Cet endroit correspond bien à ce que tu cherches.";
    const reservation = place.reservationNeeded ? "Je te conseille de réserver à l’avance." : undefined;
    return [`Je t’enverrais à ${place.name}.`, fit, reservation].filter(Boolean).join(" ");
  }

  const fit = intent ? `This place is a good fit if you are looking for ${intent}.` : "This place is a good fit for what you want.";
  const reservation = place.reservationNeeded ? "I recommend booking in advance." : undefined;
  return [`I would send you to ${place.name}.`, fit, reservation].filter(Boolean).join(" ");
}

export async function generateAnswer(input: GenerateAnswerInput): Promise<string> {
  if (!hasOpenAIKey()) {
    return fallbackAnswer(input);
  }

  const client = getOpenAIClient();
  const language = answerLanguage(input.context.language);
  const response = await client.responses.create({
    model: openaiModel,
    instructions: `${systemPrompt}

TARGET LANGUAGE: ${languageNames[language]}.
Write the complete answer only in ${languageNames[language]}.
The place name may remain in its original language, but every other sentence must use the target language.
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

  const answer = response.output_text.trim();
  return answer && matchesLanguage(answer, language) ? answer : fallbackAnswer(input);
}
