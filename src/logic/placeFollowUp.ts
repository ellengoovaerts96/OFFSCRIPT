function normalizePhraseText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isPlaceInformationFollowUp(message: string): boolean {
  const normalized = normalizePhraseText(message);

  if (
    /\b(another|other option|something else|alternative|ander(?:e)?|nog een|autre|une autre|alternative|noch eine|andere option)\b/.test(
      normalized
    )
  ) {
    return false;
  }

  const asksForMore =
    /\b(tell me more|more information|more info|meer informatie|meer info|vertel meer|en verder|plus d informations|plus d info|dis m en plus|mehr informationen|erzahl mir mehr)\b/.test(
      normalized
    );
  const asksForStory =
    /\b(story|story behind|history|origin|background|verhaal|verhaal achter|geschiedenis|ontstaan|histoire|histoire de|histoire derriere|origine|historique|geschichte|geschichte hinter|entstehung)\b/.test(
      normalized
    );
  const refersToCurrentPlace =
    /\b(it|there|this place|that place|the place|does it|is it|can you|daar|die plek|de plek|deze plek|heeft het|is het|kan je|er|cet endroit|ce lieu|la bas|là bas|est ce que|il y a|cette adresse|dort|dieser ort|der ort|hat es|ist es)\b/.test(
      normalized
    );
  const asksAboutPlaceFact =
    /\b(view|ocean|sea|quiet|busy|price|expensive|cheap|open|children|kids|food|drink|parking|wifi|airco|air conditioning|reservation|uitzicht|zee|oceaan|rustig|druk|prijs|duur|goedkoop|open|kinderen|eten|drinken|parkeren|reserveren|vue|mer|ocean|calme|anime|prix|cher|ouvert|enfants|manger|boire|parking|climatisation|reservation|aussicht|meer|ruhig|preis|teuer|geoffnet|kinder|essen|trinken)\b/.test(
      normalized
    );

  return asksForStory || asksForMore || (refersToCurrentPlace && (asksAboutPlaceFact || message.includes("?")));
}
