const VIBE_TAG_ALIASES: Record<string, string[]> = {
  rasta_reggae: ["rasta", "reggae", "rastabar", "rasta bar", "reggae bar", "bar rasta", "bar reggae"],
  romantic: ["romantic", "romantisch", "romantique"],
  calm: ["calm", "quiet", "rustig", "calme", "ruhig"],
  relaxed: ["relaxed", "relax", "laid-back", "laid back", "chill"],
  lively: ["lively", "levendig", "animé", "anime", "vibrant"],
  sunset: ["sunset", "zonsondergang", "coucher du soleil", "sonnenuntergang"],
  authentic: ["authentic", "authentiek", "authentique"],
  artistic: ["artistic", "artistiek", "artistique"],
  local: ["local", "lokaal", "locale"],
  international: ["international", "internationaal", "cosmopolitan", "cosmopolitain"]
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractVibeTags(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  const normalized = ` ${normalize(String(value))} `;

  return Object.entries(VIBE_TAG_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => normalized.includes(` ${normalize(alias)} `)))
    .map(([tag]) => tag);
}

export function vibeTagAliases(tag: string): string[] {
  return VIBE_TAG_ALIASES[tag] ?? [tag];
}

