export function detectLanguage(message: string, fallback = "fr"): string {
  const requestedLanguage = detectRequestedLanguage(message);

  if (requestedLanguage) {
    return requestedLanguage;
  }

  const lower = message.toLowerCase();
  const words = lower
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z]+/g) ?? [];
  const evidence: Record<string, Set<string>> = {
    nl: new Set(["ik", "jij", "je", "heb", "hebt", "een", "het", "de", "van", "voor", "nog", "andere", "optie", "wil", "waar", "wat", "niet", "graag"]),
    fr: new Set(["je", "tu", "vous", "une", "un", "le", "la", "les", "des", "pour", "avec", "pas", "est", "suis", "veux", "peux"]),
    en: new Set(["i", "you", "my", "your", "the", "an", "can", "could", "would", "do", "does", "is", "are", "what", "where", "why", "how", "please", "me", "tell", "help"]),
    de: new Set(["ich", "du", "sie", "ein", "eine", "der", "die", "das", "mit", "fur", "nicht", "kann", "mochte", "was", "wo", "bitte"])
  };
  const scores = Object.entries(evidence)
    .map(([language, vocabulary]) => ({
      language,
      score: words.filter((word) => vocabulary.has(word)).length
    }))
    .sort((left, right) => right.score - left.score);
  if (scores[0].score >= 2 && scores[0].score > scores[1].score) {
    return scores[0].language;
  }

  if (
    /\b(hallo|hoi|goedemorgen|goedemiddag|goedenavond|ik|heb|wil|ontmoeten|wat|betekent|bedoelt|kan|doen|morgen|waar|met wie|kinderen|ochtend|middag|avond|vanavond|cultuur|eten|strand|vrienden|alleen|koppel|familie|heel|mooi|lekker|graag|nog|andere|optie|dankjewel|bedankt|aangename|kennismaking)\b/.test(
      lower
    )
  ) {
    return "nl";
  }

  if (/\b(bonjour|bonsoir|salut|où|comment|pourquoi|reparer|réparer|que veut dire|qu est ce que|signifie|je|veux|voudrais|aimerais|tu|avec|enfants|matin|après-midi|soir|manger|plage|amis|amies)\b/.test(lower)) {
    return "fr";
  }

  if (
    /\b(is there|are there|do you have|can i|could i|where can|irish pub)\b/.test(lower) ||
    /\b(hello|i|want|would like|what|means|mean|does|where|with|children|morning|afternoon|evening|tonight|culture|food|beach|friends)\b/.test(lower)
  ) {
    return "en";
  }

  if (
    /\b(ich|will|mochte|möchte|wurde gern|würde gern|sie|alleine|allein|freunde|freundinnen|paar|familie|kinder|morgen|heute|abend|heute abend|wo|was bedeutet|bedeutet|essen|kultur|strand|natur|trinken)\b/.test(
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
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(nederlands|dutch)$/.test(lower) || /\b(in het nederlands|in dutch|spreek nederlands|speak dutch|antwoord in het nederlands|switch to dutch)\b/.test(lower)) return "nl";
  if (/^(engels|english|anglais)$/.test(lower) || /\b(in english|in het engels|en anglais|speak english|spreek engels|answer in english|antwoord in het engels|switch to english)\b/.test(lower)) return "en";
  if (/^(frans|francais|french)$/.test(lower) || /\b(en francais|in french|in het frans|parle francais|speak french|spreek frans|reponds en francais|answer in french|antwoord in het frans|switch to french)\b/.test(lower)) return "fr";
  if (/^(duits|deutsch|german|allemand)$/.test(lower) || /\b(auf deutsch|in german|in het duits|en allemand|sprich deutsch|speak german|spreek duits|answer in german|antwoord in het duits|switch to german)\b/.test(lower)) return "de";

  return undefined;
}

export function resolveConversationLanguage(
  message: string,
  existingLanguage?: string,
  fallback = "fr"
): string {
  const requestedLanguage = detectRequestedLanguage(message);
  if (requestedLanguage) return requestedLanguage;
  if (!existingLanguage) return detectLanguage(message, fallback);

  const wordCount = message
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;

  // A short reply normally inherits the conversation language, but a compact
  // phrase can still contain unmistakable language evidence. This matters for
  // conversational asides such as "heel mooi logo" in a French-started chat.
  const strongShortLanguage = (() => {
    const lower = message.toLowerCase();
    if (/\b(hallo|hoi|heel|mooi|lekker|graag|heb|nog|andere|optie|dankjewel|bedankt|gezellig|aangename|kennismaking)\b/.test(lower)) return "nl";
    if (/\b(beaucoup|merci|joli|belle|plaisir|volontiers)\b/.test(lower)) return "fr";
    if (/\b(thanks|lovely|beautiful|really|gladly)\b/.test(lower)) return "en";
    if (/\b(danke|schon|schön|gerne|wirklich)\b/.test(lower)) return "de";
    return undefined;
  })();

  if (strongShortLanguage) return strongShortLanguage;

  // Short replies such as "culture", "solo" and "sport" are often shared by
  // several languages. Keep the established conversation language for them.
  if (wordCount <= 3) return existingLanguage;

  // A complete sentence provides enough evidence to follow the language the
  // user is actually speaking, even when the conversation started differently.
  return detectLanguage(message, existingLanguage);
}
