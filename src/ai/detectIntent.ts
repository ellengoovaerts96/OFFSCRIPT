import type { UserIntent } from "../types/userContext.js";
import { normalizeActivityIntent } from "../logic/activityIntent.js";

export function detectIntent(message: string): UserIntent | undefined {
  // Never treat an explicitly rejected keyword as a positive intent. This is
  // especially important for corrections such as "geen pizza, gewoon een
  // chilled drink" where the rejected food word appears before the real ask.
  const lower = message.toLowerCase().replace(
    /\b(?:geen|niet|zonder|no|not|without|pas de|pas|sans|ne veux pas|don'?t want)\b(?:\s+\w+){0,3}\s+\b(?:food|restaurant|pizza|pizzeria|breakfast|lunch|dinner|drink|bar|cocktail|shopping|shop|beach|sport|sports|nightlife)\b/gi,
    " "
  );
  const activityIntent = normalizeActivityIntent(lower);
  if (activityIntent) return activityIntent.intent;

  if (/\b(food|eat|restaurant|breakfast|brunch|lunch|dinner|pizza|pizzeria|thieboudienne|thiéboudienne|thiebou dienne|yassa|mafe|mafé|eten|ontbijt|restaurant|manger|petit déjeuner|petit dejeuner|déjeuner|dejeuner|dîner|diner|essen|frühstück|fruhstuck|mittagessen|abendessen)\b/.test(lower)) return "food";
  if (/\b(drink|bar|cocktail|bier|drinken|boire|verre|trinken|getränk)\b/.test(lower)) return "drink";
  if (/\b(culture|museum|market|art|artwork|artworks|artist|artists|craft|crafts|gallery|galerie|atelier|cultuur|kunst|kunstenaar|kunstenaars|markt|culture|marché|artiste|artistes|artisanat|artisanal|kultur|kunst|markt)\b/.test(lower)) return "culture";
  if (/\b(beach|strand|plage)\b/.test(lower)) return "beach";
  if (/\b(sport|sports|fitness|gym|workout|training|voetbal|football|surf|surfing|surfen|surfer|yoga|pilates|tennis|running|lopen|courir)\b/.test(lower)) return "sports";
  if (/\b(spa|wellness|massage|massages|nails|nail salon|manicure|pedicure|beaute|beauty|schoonheid|bien etre|bien-être|wellnesszentrum)\b/.test(lower)) return "wellness";
  if (/(?:\bdjembe\b|\bdjembé(?:\s|$)|\bdrumming\b|\bdrum lesson\b|\bpercussion\b|\bpercussie\b|\btambour\b|\bpercussions\b)/.test(lower)) return "culture";
  if (/\b(nature|walk|hike|natuur|wandelen|nature|randonnée)\b/.test(lower)) return "nature";
  if (/\b(nightlife|dance|club|uitgaan|nachtleven|soirée|danser)\b/.test(lower)) return "nightlife";
  if (/\b(work|working|remote work|cowork|coworking|laptop|werken|werkplek|thuiswerken|telewerken|travailler|travail|télétravail|teletravail|arbeiten|arbeitsplatz)\b/.test(lower)) return "work";
  if (/\b(shop|shopping|craft|crafts|artwork|artworks|buying art|winkel|winkelen|kopen|koop|kunst kopen|boutique|artisanat|artisanal|acheter de l art|acheter de l'art|handtas|handtassen|tas|tassen|sac|sacs|einkaufen|kaufen|kunst kaufen|tasche|taschen)\b/.test(lower)) return "shopping";
  if (/\b(stay|hotel|sleep|verblijven|slapen|dormir|hôtel|übernachten|schlafen)\b/.test(lower)) return "stay";
  if (/\b(guide|gids|guide local|führer|guide lokal)\b/.test(lower)) return "guide";
  if (/\b(reserve|reservation|book|boeken|réserver|réservation|reservieren|buchung)\b/.test(lower)) return "reservation";

  return undefined;
}
