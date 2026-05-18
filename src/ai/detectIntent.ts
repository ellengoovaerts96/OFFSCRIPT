import type { UserIntent } from "../types/userContext.js";

export function detectIntent(message: string): UserIntent | undefined {
  const lower = message.toLowerCase();

  if (/\b(food|eat|restaurant|dinner|lunch|eten|restaurant|manger|déjeuner|dîner)\b/.test(lower)) return "food";
  if (/\b(drink|bar|cocktail|bier|drinken|boire|verre)\b/.test(lower)) return "drink";
  if (/\b(culture|museum|market|cultuur|markt|culture|marché)\b/.test(lower)) return "culture";
  if (/\b(beach|strand|plage)\b/.test(lower)) return "beach";
  if (/\b(nature|walk|hike|natuur|wandelen|nature|randonnée)\b/.test(lower)) return "nature";
  if (/\b(nightlife|dance|club|uitgaan|nachtleven|soirée|danser)\b/.test(lower)) return "nightlife";
  if (/\b(shop|shopping|winkel|boutique)\b/.test(lower)) return "shopping";
  if (/\b(stay|hotel|sleep|verblijven|slapen|dormir|hôtel)\b/.test(lower)) return "stay";
  if (/\b(guide|gids|guide local)\b/.test(lower)) return "guide";
  if (/\b(reserve|reservation|book|boeken|réserver|réservation)\b/.test(lower)) return "reservation";

  return undefined;
}
