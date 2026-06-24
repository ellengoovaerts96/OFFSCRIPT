export function detectLanguage(message: string, fallback = "en"): string {
  const lower = message.toLowerCase();

  if (
    /\b(ich|du|sie|alleine|allein|freunde|freundinnen|paar|familie|kinder|morgen|heute|abend|heute abend|wo|essen|kultur|strand|natur|trinken|sport)\b/.test(
      lower
    )
  ) {
    return "de";
  }

  if (
    /\b(hallo|hoi|goedemorgen|goedemiddag|goedenavond|wat|kan|doen|morgen|waar|met wie|kinderen|ochtend|middag|avond|vanavond|cultuur|eten|strand|vrienden|alleen|koppel|familie)\b/.test(
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
