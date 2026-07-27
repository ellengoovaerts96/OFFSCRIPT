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

export function preventOverSpecificDrinkSubcategory(
  message: string,
  semanticSubcategory: string | undefined
): string | undefined {
  const normalizedMessage = normalize(message);
  const normalizedSemantic = normalize(semanticSubcategory ?? "");
  const explicitlyRequestsCocktails = /\bcocktails?\b/.test(normalizedMessage);
  const explicitlyRequestsGenericDrink =
    /\b(drink|drinks|drankje|drankjes|drinken|boire|verre|aperitif|apero)\b/.test(
      normalizedMessage
    );

  // Semantic extraction may over-specialize a generic request for a drink as
  // `cocktails`. requestedSubcategory is a hard candidate filter, so that
  // would remove valid bars before editorial priority is evaluated.
  if (
    explicitlyRequestsGenericDrink &&
    !explicitlyRequestsCocktails &&
    ["cocktail", "cocktails"].includes(normalizedSemantic)
  ) {
    return "bar";
  }

  return semanticSubcategory;
}

export function preventSoftSignalAsHardSubcategory(
  semanticSubcategory: string | undefined
): string | undefined {
  const normalized = normalize(semanticSubcategory ?? "");

  // These describe where, when, or in which atmosphere the user wants to go.
  // SearchProfile already retains them as soft location, occasion, and vibe
  // signals. Treating one of them as requestedSubcategory would turn it into a
  // hard filter and remove strong editorial matches before ranking.
  const softSignals = new Set([
    "beachfront",
    "by the ocean",
    "calm",
    "chill",
    "ocean view",
    "oceanfront",
    "relaxed",
    "scenic",
    "sea view",
    "sunset",
    "view"
  ]);

  return softSignals.has(normalized) ? undefined : semanticSubcategory;
}

export function keepOnlyHardRequestedAmenities(
  amenities: string[]
): string[] {
  // Ocean view describes the desired setting. It is deliberately a soft
  // SearchProfile location feature because older editorial favourites can
  // clearly overlook the ocean without having the newer amenity tag.
  return amenities.filter((amenity) => amenity !== "ocean_view");
}
