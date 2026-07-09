import { getOpenAIClient, hasOpenAIKey, openaiModel } from "../integrations/openai.js";
import type { Place } from "../types/place.js";
import type { RetrievedFacts } from "../types/retrieval.js";
import type { UserContext } from "../types/userContext.js";
import { systemPrompt } from "./systemPrompt.js";

export type GenerateAnswerInput = {
  userMessage: string;
  context: UserContext;
  selectedPlace: Place;
  retrievedFacts?: RetrievedFacts;
};

type SupportedAnswerLanguage = "nl" | "fr" | "de" | "en";

const languageNames: Record<SupportedAnswerLanguage, string> = {
  nl: "Dutch (Nederlands)",
  fr: "French (français)",
  de: "German (Deutsch)",
  en: "British English"
};

const britishEnglishReplacements: Array<[RegExp, string]> = [
  [/\btraveler\b/gi, "traveller"],
  [/\btravelers\b/gi, "travellers"],
  [/\btraveling\b/gi, "travelling"],
  [/\btraveled\b/gi, "travelled"],
  [/\bfavorite\b/gi, "favourite"],
  [/\bfavorites\b/gi, "favourites"],
  [/\bflavor\b/gi, "flavour"],
  [/\bflavors\b/gi, "flavours"],
  [/\bcolor\b/gi, "colour"],
  [/\bcolors\b/gi, "colours"],
  [/\bcenter\b/gi, "centre"],
  [/\bcenters\b/gi, "centres"],
  [/\bneighborhood\b/gi, "neighbourhood"],
  [/\bneighborhoods\b/gi, "neighbourhoods"],
  [/\borganize\b/gi, "organise"],
  [/\borganized\b/gi, "organised"],
  [/\borganizing\b/gi, "organising"],
  [/\bsavor\b/gi, "savour"],
  [/\bsavory\b/gi, "savoury"]
];

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
  de: [
    "aber",
    "als",
    "auch",
    "auf",
    "das",
    "dein",
    "der",
    "die",
    "du",
    "ein",
    "eine",
    "für",
    "ich",
    "im",
    "in",
    "ist",
    "mit",
    "und",
    "wenn"
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
    practicalInfo: place.practicalInfo,
    personalTip: place.personalTip,
    transport: place.transport,
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

function buildRetrievedFacts(facts: RetrievedFacts | undefined): Record<string, unknown> {
  if (!facts) {
    return {
      places: [],
      stories: [],
      experiences: []
    };
  }

  return {
    places: facts.places.map((place) => buildPlaceFacts(place)),
    stories: facts.stories.map((story) => ({
      title: story.title,
      slug: story.slug,
      category: story.category,
      excerpt: story.excerpt,
      url: story.url
    })),
    experiences: facts.experiences.map((experience) => ({
      title: experience.title,
      slug: experience.slug,
      shortDescription: experience.shortDescription,
      duration: experience.duration,
      location: experience.location,
      price: experience.price,
      currency: experience.currency,
      maxPeople: experience.maxPeople,
      childFriendly: experience.childFriendly,
      meetingPoint: experience.meetingPoint,
      reservationRequired: experience.reservationRequired,
      url: experience.url
    }))
  };
}

function answerLanguage(language: string): SupportedAnswerLanguage {
  if (language.startsWith("nl")) return "nl";
  if (language.startsWith("fr")) return "fr";
  if (language.startsWith("de")) return "de";
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
    de: {
      food: "Essen",
      drink: "etwas trinken",
      culture: "Kultur",
      beach: "den Strand",
      sports: "Sport",
      nature: "Natur",
      nightlife: "Ausgehen",
      shopping: "Shopping",
      stay: "eine Unterkunft",
      guide: "einen Guide",
      reservation: "eine Reservierung"
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

function normaliseEnglishVariant(text: string, language: SupportedAnswerLanguage): string {
  if (language !== "en") return text;

  return britishEnglishReplacements.reduce(
    (normalised, [pattern, replacement]) =>
      normalised.replace(pattern, (match) =>
        match[0] === match[0].toUpperCase()
          ? replacement[0].toUpperCase() + replacement.slice(1)
          : replacement
      ),
    text
  );
}

function removeWolofGreeting(text: string): string {
  return text.replace(/^\s*na nga def\??\s*/i, "").trim();
}

function practicalInfoLabel(language: SupportedAnswerLanguage): string {
  if (language === "nl") return "Praktisch";
  if (language === "fr") return "Pratique";
  if (language === "de") return "Praktisch";
  return "Practical info";
}

function ensurePracticalInfo(text: string, place: Place, language: SupportedAnswerLanguage): string {
  if (!place.practicalInfo) return text;

  const normalizedText = text.toLowerCase();
  const normalizedPracticalInfo = place.practicalInfo.toLowerCase();
  if (normalizedText.includes(normalizedPracticalInfo)) return text;

  return `${text} ${practicalInfoLabel(language)}: ${place.practicalInfo}`;
}

function fallbackAnswer(input: GenerateAnswerInput): string {
  const place = input.selectedPlace;
  const language = answerLanguage(input.context.language);
  const intent = intentLabel(input.context, language);

  if (language === "nl") {
    const fit = intent ? `Deze plek past goed als je zin hebt in ${intent}.` : "Deze plek past goed bij wat je zoekt.";
    const practicalInfo = place.practicalInfo ? `Praktisch: ${place.practicalInfo}` : undefined;
    const reservation = place.reservationNeeded ? "Ik raad aan om vooraf te reserveren." : undefined;
    return [`Ik zou je naar ${place.name} sturen.`, fit, practicalInfo, reservation].filter(Boolean).join(" ");
  }

  if (language === "fr") {
    const fit = intent ? `Cet endroit te convient bien si tu cherches ${intent}.` : "Cet endroit correspond bien à ce que tu cherches.";
    const practicalInfo = place.practicalInfo ? `Pratique : ${place.practicalInfo}` : undefined;
    const reservation = place.reservationNeeded ? "Je te conseille de réserver à l’avance." : undefined;
    return [`Je t’enverrais à ${place.name}.`, fit, practicalInfo, reservation].filter(Boolean).join(" ");
  }

  if (language === "de") {
    const fit = intent ? `Dieser Ort passt gut, wenn du Lust auf ${intent} hast.` : "Dieser Ort passt gut zu dem, was du suchst.";
    const practicalInfo = place.practicalInfo ? `Praktisch: ${place.practicalInfo}` : undefined;
    const reservation = place.reservationNeeded ? "Ich würde vorher reservieren." : undefined;
    return [`Ich würde dich zu ${place.name} schicken.`, fit, practicalInfo, reservation].filter(Boolean).join(" ");
  }

  const fit = intent ? `This place is a good fit if you are looking for ${intent}.` : "This place is a good fit for what you want.";
  const practicalInfo = place.practicalInfo ? `Practical info: ${place.practicalInfo}` : undefined;
  const reservation = place.reservationNeeded ? "I recommend booking in advance." : undefined;
  return [`I would send you to ${place.name}.`, fit, practicalInfo, reservation].filter(Boolean).join(" ");
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
When writing in English, use British spelling and vocabulary throughout, never American English.
The place name may remain in its original language, but every other sentence must use the target language.
Write one warm, concise WhatsApp recommendation.
Do not start with or include "Na nga def?". That greeting is only for the first bot message in a WhatsApp conversation.
Use only the provided selectedPlace facts.
You may use retrievedFacts.stories and retrievedFacts.experiences only when they directly support the answer.
Maximum 3 short sentences.
Include the place name, why it fits, and practicalInfo when selectedPlace.practicalInfo is available.
Add at most one extra useful tip beyond practicalInfo.
Do not include a Google Maps link.
Only include a URL if it comes from retrievedFacts.stories or retrievedFacts.experiences and is directly relevant.
Omit missing facts. Do not invent anything.`,
    input: JSON.stringify({
      userMessage: input.userMessage,
      context: input.context,
      selectedPlace: buildPlaceFacts(input.selectedPlace),
      retrievedFacts: buildRetrievedFacts(input.retrievedFacts)
    })
  });

  const answer = ensurePracticalInfo(
    removeWolofGreeting(normaliseEnglishVariant(response.output_text.trim(), language)),
    input.selectedPlace,
    language
  );
  return answer && matchesLanguage(answer, language) ? answer : fallbackAnswer(input);
}
