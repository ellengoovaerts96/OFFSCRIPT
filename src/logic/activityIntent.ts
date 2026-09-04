import type { UserIntent } from "../types/userContext.js";

export type RecommendationType = "place" | "activity" | "route";

export type NormalizedActivityIntent = {
  focus: string;
  intent: UserIntent;
  recommendationType: RecommendationType;
};

const ACTIVITY_PATTERNS: Array<NormalizedActivityIntent & { pattern: RegExp }> = [
  {
    focus: "running",
    intent: "sports",
    recommendationType: "route",
    pattern: /\b(jog|jogs|jogging|run|running|hardlopen|joggen|rennen|courir|course a pied|lauf|laufen)\b/
  },
  {
    focus: "cycling",
    intent: "sports",
    recommendationType: "route",
    pattern: /\b(cycle|cycling|bike ride|biking|fietsen|fietsroute|velo|faire du velo|radfahren|radtour)\b/
  },
  {
    focus: "photography walk",
    intent: "culture",
    recommendationType: "route",
    pattern: /\b(photography walk|photo walk|fotowandeling|fotografie wandeling|promenade photo|balade photo|fotowalk)\b/
  },
  {
    focus: "walking",
    intent: "nature",
    recommendationType: "route",
    pattern: /\b(walk|walking|hike|hiking|wandelen|promenade|se promener|marcher|randonnee|spazieren|wandern)\b/
  },
  {
    focus: "swimming",
    intent: "sports",
    recommendationType: "activity",
    pattern: /\b(swim|swimming|zwemmen|natation|nager|schwimmen)\b/
  },
  {
    focus: "surfing",
    intent: "sports",
    recommendationType: "activity",
    pattern: /\b(surf|surfing|surfen|surfer)\b/
  }
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeActivityIntent(value: string | undefined): NormalizedActivityIntent | undefined {
  if (!value) return undefined;
  const normalized = normalize(value);
  return ACTIVITY_PATTERNS.find(({ pattern }) => pattern.test(normalized));
}
