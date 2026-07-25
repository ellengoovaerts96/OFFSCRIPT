import type { Place, PlaceCategory } from "../types/place.js";
import type { UserIntent } from "../types/userContext.js";

export type SubcategoryTaxonomyEntry = {
  name: string;
  intent: UserIntent;
};

const CATEGORY_INTENTS: Partial<Record<PlaceCategory, UserIntent>> = {
  food: "food",
  bar: "drink",
  culture: "culture",
  beach: "beach",
  sports: "sports",
  nature: "nature",
  nightlife: "nightlife",
  shopping: "shopping",
  stay: "stay",
  guide: "guide",
  other: "other"
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferredIntent(name: string, categories: PlaceCategory[]): UserIntent {
  const value = normalize(name);
  if (/\b(spa|wellness|massage|nails|nail salon|manicure|pedicure|beauty)\b/.test(value)) {
    return "wellness";
  }
  if (/\b(fitness|gym|yoga|pilates|surf|surfing|running|swimming)\b/.test(value)) {
    return "sports";
  }
  if (/\b(djembe|drumming|percussion|music|art|museum|architecture|monument)\b/.test(value)) {
    return "culture";
  }

  return categories
    .map((category) => CATEGORY_INTENTS[category])
    .find((intent): intent is UserIntent => Boolean(intent)) ?? "other";
}

export function buildSubcategoryTaxonomy(places: Place[]): SubcategoryTaxonomyEntry[] {
  const entries = new Map<string, { name: string; categories: Set<PlaceCategory> }>();

  for (const place of places) {
    for (const subcategory of place.subcategories) {
      const key = normalize(subcategory.name);
      if (!key) continue;
      const entry = entries.get(key) ?? {
        name: subcategory.name.trim(),
        categories: new Set<PlaceCategory>()
      };
      place.categories.forEach((category) => entry.categories.add(category));
      entries.set(key, entry);
    }
  }

  return [...entries.values()]
    .map((entry) => ({
      name: entry.name,
      intent: inferredIntent(entry.name, [...entry.categories])
    }))
    .sort((left, right) => normalize(right.name).length - normalize(left.name).length);
}

export function matchKnownSubcategory(
  message: string,
  taxonomy: SubcategoryTaxonomyEntry[]
): SubcategoryTaxonomyEntry | undefined {
  const searchable = ` ${normalize(message)} `;
  return taxonomy.find((entry) => searchable.includes(` ${normalize(entry.name)} `));
}
