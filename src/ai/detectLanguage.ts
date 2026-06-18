export function detectLanguage(message: string, fallback = "en"): string {
  const lower = message.toLowerCase();

  if (
    /\b(hallo|hoi|goedemorgen|goedemiddag|goedenavond|waar|met wie|kinderen|ochtend|middag|avond|vanavond|cultuur|eten|strand|vrienden)\b/.test(
      lower
    )
  ) {
    return "nl";
  }

  if (/\b(bonjour|bonsoir|salut|où|tu|avec|enfants|matin|après-midi|soir|manger|plage|amis|amies)\b/.test(lower)) {
    return "fr";
  }

  if (/\b(hello|where|with|children|morning|afternoon|evening|tonight|culture|food|beach|friends)\b/.test(lower)) {
    return "en";
  }

  return fallback;
}
