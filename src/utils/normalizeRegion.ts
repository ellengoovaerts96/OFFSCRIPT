const REGION_ALIASES: Record<string, string> = {
  dakar: "Dakar",
  ngor: "Ngor",
  yoff: "Yoff",
  almadies: "Almadies",
  "pointe des almadies": "Pointe des Almadies",
  "pointe almadies": "Pointe des Almadies",
  oakam: "Ouakam",
  ouakam: "Ouakam",
};

export const KNOWN_REGIONS = [...new Set(Object.values(REGION_ALIASES))].sort((left, right) =>
  left.localeCompare(right)
);

const SUPPORTED_REGIONS = new Set(KNOWN_REGIONS);

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/\s+/g, " ");
}

export function normalizeRegion(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const key = normalizeKey(value);
  return REGION_ALIASES[key] ?? value.trim();
}

export function normalizeSupportedRegion(value: string | undefined): string | undefined {
  const normalized = normalizeRegion(value);
  return normalized && SUPPORTED_REGIONS.has(normalized) ? normalized : undefined;
}

export function findKnownRegion(message: string): string | undefined {
  const normalizedMessage = normalizeKey(message);

  const match = Object.keys(REGION_ALIASES)
    .sort((a, b) => b.length - a.length)
    .find((alias) => normalizedMessage.includes(alias));

  return match ? REGION_ALIASES[match] : undefined;
}
