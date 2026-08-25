import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient, hasOpenAIKey, openaiModel } from "../integrations/openai.js";
import {
  buildLanguageSafeRecommendationTextFallback,
  deduplicateRecommendationText
} from "../logic/recommendationTextFallback.js";

type SupportedRecommendationLanguage = "nl" | "fr" | "de" | "en";

const languageNames: Record<SupportedRecommendationLanguage, string> = {
  nl: "Dutch (Nederlands)",
  fr: "French (français)",
  de: "German (Deutsch)",
  en: "British English"
};

const localizedRecommendationSchema = z.object({
  shortDescription: z.string(),
  personalTip: z.string().nullable()
});

const localizedPracticalInfoSchema = z.object({
  practicalInfo: z.string()
});

// The WhatsApp webhook has its own response deadline. Both localization calls
// must share one budget so they can never take 6 seconds each in succession.
const LOCALIZATION_TOTAL_TIMEOUT_MS = 4500;

export type LocalizeRecommendationTextInput = {
  language: string;
  shortDescription: string;
  offscriptReason?: string;
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

function fallbackRecommendationText(
  input: LocalizeRecommendationTextInput
): LocalizedRecommendationText {
  return buildLanguageSafeRecommendationTextFallback(input);
}

async function translatePracticalInfo(
  practicalInfo: string,
  language: SupportedRecommendationLanguage,
  timeoutMs: number
): Promise<string | undefined> {
  if (timeoutMs <= 0) return undefined;

  try {
    const client = getOpenAIClient();
    const response = await withTimeout(client.responses.parse({
      model: openaiModel,
      instructions: `Translate the complete practical information into ${languageNames[language]}.
Rules:
- Translate every human-readable line and bullet.
- Preserve every detail. Do not summarize, shorten, combine or remove anything.
- Preserve the number and order of lines and bullets.
- Keep emojis, URLs, prices, times, phone numbers and proper nouns unchanged.
- Return only the translated practicalInfo field.`,
      input: JSON.stringify({ practicalInfo }),
      text: {
        format: zodTextFormat(localizedPracticalInfoSchema, "localized_practical_info")
      }
    }), timeoutMs);

    return response?.output_parsed?.practicalInfo?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function localizeRecommendationText(
  input: LocalizeRecommendationTextInput
): Promise<LocalizedRecommendationText> {
  const language = recommendationLanguage(input.language);
  const localizationDeadline = Date.now() + LOCALIZATION_TOTAL_TIMEOUT_MS;

  if (!hasOpenAIKey()) {
    return fallbackRecommendationText(input);
  }

  try {
    const client = getOpenAIClient();
    const prosePromise = withTimeout(client.responses.parse({
      model: openaiModel,
      instructions: `Write the provided OFFSCRIPT recommendation fields in ${languageNames[language]}.
Rules:
- Every human-readable sentence in the response MUST be in ${languageNames[language]}. Never return a mix of languages.
- Combine offscriptReason and shortDescription into one fluent, concise recommendation of 2 to 4 complete grammatical sentences in a trusted local-friend voice.
- offscriptReason explains why OFFSCRIPT cares about the place; shortDescription supplies atmosphere and concrete context.
- Rewrite note fragments, keyword lists and telegraphic source text as natural sentences with subjects and verbs.
- Do not return bullets, sentence fragments or a mechanical concatenation of the source fields.
- Say each idea only once. Consolidate overlapping facts and omit duplicated wording while preserving the distinct supported information.
- Do not use travel-guide or brochure language.
- Translate when the source differs from the target language.
- Keep place names, URLs, prices, times, phone numbers and proper nouns unchanged.
- Do not add labels such as "Practical info" or "Praktisch".
- Preserve personalTip as a separate field and never replace it with a generic AI tip.
- Avoid repetition between shortDescription, offscriptReason and personalTip.
- Do not add unsupported information.
- Return empty or missing fields as empty/null.`,
      input: JSON.stringify({
        shortDescription: input.shortDescription,
        offscriptReason: input.offscriptReason ?? null,
        personalTip: input.personalTip ?? null
      }),
      text: {
        format: zodTextFormat(localizedRecommendationSchema, "localized_recommendation")
      }
    }), Math.max(1, localizationDeadline - Date.now()));

    // Translating a long practical-info list used to block the smaller prose
    // response and make the entire card fall back to mixed source languages.
    // Run it independently and concurrently instead.
    const practicalInfoPromise =
      input.practicalInfo && (language === "nl" || language === "de")
        ? translatePracticalInfo(
            input.practicalInfo,
            language,
            Math.max(1, localizationDeadline - Date.now())
          )
        : Promise.resolve(input.practicalInfo?.trim() || undefined);

    const [response, practicalInfo] = await Promise.all([
      prosePromise,
      practicalInfoPromise
    ]);

    const localized = response?.output_parsed;

    if (!localized) {
      return fallbackRecommendationText(input);
    }

    const fallback = fallbackRecommendationText(input);

    return deduplicateRecommendationText({
      shortDescription: localized?.shortDescription?.trim() || fallback.shortDescription,
      personalTip: localized?.personalTip?.trim() || fallback.personalTip,
      // For Dutch and German, omitting untranslated practical info is safer
      // than leaking the French/English database source into the card.
      practicalInfo:
        practicalInfo ||
        ((language === "en" || language === "fr") ? input.practicalInfo : undefined)
    });
  } catch {
    return fallbackRecommendationText(input);
  }
}
