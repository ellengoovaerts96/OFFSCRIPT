export function detectLanguage(message: string): string {
  const lower = message.toLowerCase();

  if (/\b(waar|met wie|kinderen|ochtend|middag|avond|vanavond|cultuur|eten|strand|vrienden)\b/.test(lower)) {
    return "nl";
  }

  if (/\b(où|tu|avec|enfants|matin|après-midi|soir|manger|plage|amis|amies)\b/.test(lower)) {
    return "fr";
  }

  return "en";
}
