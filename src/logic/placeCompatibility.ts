import type {
  PlaceAmenity,
  PlaceCategory
} from "../types/place.js";

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function compatibleCategories(values: unknown): PlaceCategory[] {
  if (!Array.isArray(values)) return [];
  return unique(values.flatMap((value): PlaceCategory[] => {
    if (typeof value !== "string") return [];
    const candidate = normalize(value);
    if (["food", "restaurant", "cafe", "café", "food_and_drink"].includes(candidate)) {
      return candidate === "food_and_drink" ? ["food", "bar"] : ["food"];
    }
    if (["bar", "drink", "drinks"].includes(candidate)) return ["bar"];
    if (["sport", "sports"].includes(candidate)) return ["sports"];
    if (["shop", "shopping", "market"].includes(candidate)) return ["shopping"];
    if (["culture", "beach", "nature", "nightlife", "stay", "guide", "other"].includes(candidate)) {
      return [candidate as PlaceCategory];
    }
    return [];
  }));
}

export function compatibleAudienceTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return unique(values.flatMap((value): string[] => {
    if (typeof value !== "string") return [];
    const candidate = normalize(value);
    if (["local", "locals", "resident", "residents", "habitants_locaux"].includes(candidate)) {
      return ["residents"];
    }
    if ([
      "expat",
      "expats",
      "african_expats",
      "international_expats",
      "expatries"
    ].includes(candidate)) {
      return ["expats"];
    }
    return candidate ? [candidate] : [];
  }));
}

export function compatibleTravellerTypes(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const aliases: Record<string, string> = {
    solo_traveller: "solo",
    solo_traveler: "solo",
    solo: "solo",
    couples: "couple",
    couple: "couple",
    friends: "friends",
    family: "family",
    families: "family",
    group: "group",
    groups: "group",
    business: "business"
  };
  return unique(values.flatMap((value): string[] => {
    if (typeof value !== "string") return [];
    const candidate = aliases[normalize(value)];
    return candidate ? [candidate] : [];
  }));
}

export function compatibleAmenities(
  values: unknown,
  legacyText: Array<string | null | undefined>
): PlaceAmenity[] {
  const amenities = Array.isArray(values)
    ? values.filter((value): value is PlaceAmenity =>
      typeof value === "string" &&
      ["air_conditioning", "wifi", "power_outlets", "indoor_seating"].includes(value)
    )
    : [];
  const searchable = normalize(legacyText.filter(Boolean).join(" "));
  if (["airco", "air_conditioning", "air_conditioned", "climatisation", "climatise"]
    .some((term) => searchable.includes(term))) {
    amenities.push("air_conditioning");
  }
  if (["wifi", "wi_fi", "internet"].some((term) => searchable.includes(term))) {
    amenities.push("wifi");
  }
  if (["power_outlets", "prises", "stopcontacten", "sockets"]
    .some((term) => searchable.includes(term))) {
    amenities.push("power_outlets");
  }
  if (["indoor", "inside", "interieur", "binnen"]
    .some((term) => searchable.includes(term))) {
    amenities.push("indoor_seating");
  }
  return unique(amenities);
}
