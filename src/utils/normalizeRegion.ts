const REGION_ALIASES: Record<string, string> = {
  dakar: "Dakar",
  ngor: "Ngor",
  yoff: "Yoff",
  almadies: "Almadies",
  plateau: "Plateau",
  medina: "Médina",
  "médina": "Médina",
  "sacre coeur": "Sacré-Cœur",
  "sacré coeur": "Sacré-Cœur",
  "sacre cœur": "Sacré-Cœur",
  "sacre-coeur": "Sacré-Cœur",
  "sacré-cœur": "Sacré-Cœur",
  "sacré-coeur": "Sacré-Cœur",
  "sacre-cœur": "Sacré-Cœur",
  ouakam: "Ouakam",
  mamelles: "Mamelles",
  goree: "Île de Gorée",
  gorée: "Île de Gorée",
  mbour: "Mbour",
  saly: "Saly",
  "saint-louis": "Saint-Louis",
  "saint louis": "Saint-Louis",
  casamance: "Casamance",
  "lac rose": "Lac Rose"
};

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

export function findKnownRegion(message: string): string | undefined {
  const normalizedMessage = normalizeKey(message);

  const match = Object.keys(REGION_ALIASES)
    .sort((a, b) => b.length - a.length)
    .find((alias) => normalizedMessage.includes(alias));

  return match ? REGION_ALIASES[match] : undefined;
}
