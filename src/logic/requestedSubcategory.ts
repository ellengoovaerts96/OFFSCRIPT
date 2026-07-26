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
