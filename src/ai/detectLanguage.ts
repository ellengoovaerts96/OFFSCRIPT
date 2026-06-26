export function detectLanguage(message: string, fallback = "en"): string {
  const requestedLanguage = detectRequestedLanguage(message);

  if (requestedLanguage) {
    return requestedLanguage;
  }

  const lower = message.toLowerCase();

  if (
    /\b(hallo|hoi|goedemorgen|goedemiddag|goedenavond|ik|wil|ontmoeten|wat|betekent|bedoelt|kan|doen|morgen|waar|met wie|kinderen|ochtend|middag|avond|vanavond|cultuur|eten|strand|vrienden|alleen|koppel|familie)\b/.test(
      lower
    )
  ) {
    return "nl";
  }

  if (/\b(bonjour|bonsoir|salut|où|que veut dire|qu est ce que|signifie|tu|avec|enfants|matin|après-midi|soir|manger|plage|amis|amies)\b/.test(lower)) {
    return "fr";
  }

  if (/\b(hello|what|means|mean|does|where|with|children|morning|afternoon|evening|tonight|culture|food|beach|friends)\b/.test(lower)) {
    return "en";
  }

  if (
    /\b(ich|sie|alleine|allein|freunde|freundinnen|paar|familie|kinder|morgen|heute|abend|heute abend|wo|was bedeutet|bedeutet|essen|kultur|strand|natur|trinken|sport)\b/.test(
      lower
    )
  ) {
    return "de";
  }

  return fallback;
}

export function detectRequestedLanguage(message: string): string | undefined {
  const lower = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/\b(nederlands|dutch)\b/.test(lower)) return "nl";
  if (/\b(engels|english)\b/.test(lower)) return "en";
  if (/\b(frans|francais|french)\b/.test(lower)) return "fr";
  if (/\b(duits|deutsch|german)\b/.test(lower)) return "de";

  return undefined;
}
