export type PracticalInfoLanguage = "nl" | "fr" | "de" | "en";

export function practicalInfoNeedsTranslationRetry(input: {
  language: PracticalInfoLanguage;
  source?: string;
  localized?: string | null;
}): boolean {
  if (!input.source?.trim()) return false;

  const localized = input.localized?.trim();
  if (!localized) return true;

  // English and French are stored source languages. For Dutch and German,
  // receiving the exact source again means the field was not translated.
  return (input.language === "nl" || input.language === "de") &&
    localized === input.source.trim();
}
