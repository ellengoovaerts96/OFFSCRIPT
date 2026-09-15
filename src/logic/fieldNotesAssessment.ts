function normalized(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'");
}

const UNKNOWN_VALUES = new Set([
  "inconnu",
  "non applicable / inconnu",
  "non evalue",
  "je ne sais pas encore",
  "impossible a estimer"
]);

export function hasAssessmentAnswer(value: unknown): boolean {
  return normalized(value) !== "";
}

export function assessmentInteger(value: unknown, min: number, max: number, field: string): number | null {
  const text = normalized(value);
  if (!text || UNKNOWN_VALUES.has(text)) return null;
  const match = text.match(/^(-?\d+)(?:\s|—|–|-|$)/);
  if (!match) throw new Error(`${field} must start with an integer from ${min} to ${max}, or be unknown.`);
  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} must be an integer from ${min} to ${max}.`);
  }
  return parsed;
}

function selections(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(normalized).filter(Boolean);
  return String(value ?? "").split(",").map(normalized).filter(Boolean);
}

function canonicalTags(value: unknown, aliases: Record<string, string>, field: string): string[] {
  const result: string[] = [];
  for (const selection of selections(value)) {
    if (UNKNOWN_VALUES.has(selection)) continue;
    const tag = aliases[selection] ?? aliases[selection.replace(/\s+/g, "_")];
    if (!tag) throw new Error(`Unknown ${field} selection: ${selection}.`);
    if (!result.includes(tag)) result.push(tag);
  }
  return result;
}

export function assessmentAudienceTags(value: unknown): string[] {
  const filtered = selections(value).filter((selection) => selection !== "public mixte");
  return canonicalTags(filtered, {
    "habitants / locaux": "locals",
    habitants_locaux: "locals",
    residents: "locals",
    locaux: "locals",
    locals: "locals",
    "expatries africains": "african_expats",
    african_expats: "african_expats",
    "expatries internationaux": "international_expats",
    international_expats: "international_expats",
    expatries: "expats",
    expats: "expats",
    touristes: "tourists",
    tourists: "tourists",
    "voyageurs aventureux": "adventurous_travellers",
    adventurous_travellers: "adventurous_travellers",
    familles: "families",
    families: "families",
    "public jeune": "young_crowd",
    young_crowd: "young_crowd",
    "public professionnel": "business_crowd",
    business_crowd: "business_crowd"
  }, "audience");
}

export function assessmentAudienceIsExplicitlyMixed(value: unknown): boolean {
  return selections(value).includes("public mixte");
}

export function assessmentOccasionTags(value: unknown): string[] {
  return canonicalTags(value, {
    seul: "solo", solo: "solo",
    "en couple": "couple", couple: "couple",
    "rendez-vous / date": "date", date: "date",
    "entre amis": "friends", friends: "friends",
    "en famille": "family", family: "family",
    "coucher de soleil": "sunset", sunset: "sunset",
    "boire un verre": "drinks", drinks: "drinks",
    "musique live": "live_music", live_music: "live_music",
    "se detendre": "relaxing", relaxing: "relaxing",
    "petit budget": "budget_friendly", budget_friendly: "budget_friendly",
    "experience locale": "local_experience", local_experience: "local_experience",
    "vie nocturne": "nightlife", nightlife: "nightlife",
    romantique: "romantic", romantic: "romantic"
  }, "occasion");
}

export function assessmentWorkFriendly(value: unknown): boolean | null {
  const text = normalized(value);
  if (!text || text === "non evalue") return null;
  if (text === "oui" || text === "true") return true;
  if (text === "non" || text === "false") return false;
  throw new Error("work_friendly must be Oui, Non, or Non évalué.");
}
