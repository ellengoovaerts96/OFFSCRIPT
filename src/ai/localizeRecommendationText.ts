import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient, hasOpenAIKey, openaiModel } from "../integrations/openai.js";

type SupportedRecommendationLanguage = "nl" | "fr" | "de" | "en";

const languageNames: Record<SupportedRecommendationLanguage, string> = {
  nl: "Dutch (Nederlands)",
  fr: "French (français)",
  de: "German (Deutsch)",
  en: "British English"
};

const localizedRecommendationSchema = z.object({
  shortDescription: z.string(),
  personalTip: z.string().nullable(),
  practicalInfo: z.string().nullable()
});

const LOCALIZATION_TIMEOUT_MS = 1800;

export type LocalizeRecommendationTextInput = {
  language: string;
  shortDescription: string;
  personalTip?: string;
  practicalInfo?: string;
};

export type LocalizedRecommendationText = {
  shortDescription: string;
  personalTip?: string;
  practicalInfo?: string;
};

function recommendationLanguage(language: string): SupportedRecommendationLanguage {
  if (language.startsWith("nl")) return "nl";
  if (language.startsWith("fr")) return "fr";
  if (language.startsWith("de")) return "de";
  if (language.startsWith("en")) return "en";
  return "fr";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeout: NodeJS.Timeout | undefined;
  promise.catch(() => undefined);

  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function localizeRecommendationText(
  input: LocalizeRecommendationTextInput
): Promise<LocalizedRecommendationText> {
  const language = recommendationLanguage(input.language);

  if (language === "en" || !hasOpenAIKey()) {
    return {
      shortDescription: input.shortDescription,
      personalTip: input.personalTip,
      practicalInfo: input.practicalInfo
    };
  }

  try {
    const client = getOpenAIClient();
    const response = await withTimeout(client.responses.parse({
      model: openaiModel,
      instructions: `Translate the provided OFFSCRIPT recommendation fields to ${languageNames[language]}.
Rules:
- Translate only the text values.
- Keep place names, URLs, prices, times, phone numbers and proper nouns unchanged.
- Preserve bullet structure, line breaks, emojis and punctuation where possible.
- Do not add labels such as "Practical info" or "Praktisch".
- Do not add new information and do not remove details.
- Return empty or missing fields as empty/null.`,
      input: JSON.stringify({
        shortDescription: input.shortDescription,
        personalTip: input.personalTip ?? null,
        practicalInfo: input.practicalInfo ?? null
      }),
      text: {
        format: zodTextFormat(localizedRecommendationSchema, "localized_recommendation")
      }
    }), LOCALIZATION_TIMEOUT_MS);

    const localized = response?.output_parsed;

    return {
      shortDescription: localized?.shortDescription?.trim() || input.shortDescription,
      personalTip: localized?.personalTip?.trim() || input.personalTip,
      practicalInfo: localized?.practicalInfo?.trim() || input.practicalInfo
    };
  } catch {
    return {
      shortDescription: input.shortDescription,
      personalTip: input.personalTip,
      practicalInfo: input.practicalInfo
    };
  }
}
