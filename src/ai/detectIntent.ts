import type { UserIntent } from "../types/userContext.js";

export function detectIntent(message: string): UserIntent | undefined {
  const lower = message.toLowerCase();

  if (/\b(food|eat|restaurant|breakfast|brunch|lunch|dinner|eten|ontbijt|restaurant|manger|petit déjeuner|petit dejeuner|déjeuner|dejeuner|dîner|diner|essen|frühstück|fruhstuck|mittagessen|abendessen)\b/.test(lower)) return "food";
  if (/\b(drink|bar|cocktail|bier|drinken|boire|verre|trinken|getränk)\b/.test(lower)) return "drink";
  if (/\b(culture|museum|market|cultuur|markt|culture|marché|kultur|markt)\b/.test(lower)) return "culture";
  if (/\b(beach|strand|plage)\b/.test(lower)) return "beach";
  if (/\b(sport|sports|fitness|gym|workout|training|voetbal|football|surf|surfing|yoga|tennis|running|lopen|courir)\b/.test(lower)) return "sports";
  if (/\b(nature|walk|hike|natuur|wandelen|nature|randonnée)\b/.test(lower)) return "nature";
  if (/\b(nightlife|dance|club|uitgaan|nachtleven|soirée|danser)\b/.test(lower)) return "nightlife";
  if (/\b(shop|shopping|winkel|winkelen|kopen|koop|boutique|handtas|handtassen|tas|tassen|sac|sacs|einkaufen|kaufen|tasche|taschen)\b/.test(lower)) return "shopping";
  if (/\b(stay|hotel|sleep|verblijven|slapen|dormir|hôtel|übernachten|schlafen)\b/.test(lower)) return "stay";
  if (/\b(guide|gids|guide local|führer|guide lokal)\b/.test(lower)) return "guide";
  if (/\b(reserve|reservation|book|boeken|réserver|réservation|reservieren|buchung)\b/.test(lower)) return "reservation";

  return undefined;
}
