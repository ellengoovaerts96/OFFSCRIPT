import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient, hasOpenAIKey, openaiModel } from "../integrations/openai.js";
import type { TravellerType, UserContext, UserIntent } from "../types/userContext.js";
import { findKnownRegion, normalizeRegion } from "../utils/normalizeRegion.js";
import { detectIntent } from "./detectIntent.js";
import { resolveConversationLanguage } from "./detectLanguage.js";
import { systemPrompt } from "./systemPrompt.js";

const travellerTypeSchema = z.enum(["solo", "couple", "friends", "family", "group", "business", "unknown"]);
const intentSchema = z.enum([
  "food",
  "drink",
  "culture",
  "beach",
  "sports",
  "nature",
  "nightlife",
  "shopping",
  "work",
  "stay",
  "guide",
  "reservation",
  "unknown"
]);

const userContextSchema = z.object({
  language: z.string().min(2),
  currentLocation: z.string().nullable(),
  targetRegion: z.string().nullable(),
  travellerType: travellerTypeSchema.nullable(),
  hasChildren: z.boolean().nullable(),
  childrenAges: z.string().nullable(),
  intent: intentSchema.nullable(),
  timing: z.string().nullable(),
  budget: z.string().nullable(),
  requestedSubcategory: z.string().nullable(),
  requestedStyle: z.string().nullable(),
  requestedAmenities: z.array(z.enum(["air_conditioning", "wifi", "power_outlets", "indoor_seating"])),
  vibe: z.string().nullable(),
  excludedCategories: z.array(intentSchema),
  excludedSubcategories: z.array(z.string()),
  dietaryExclusions: z.array(z.string()),
  avoidAudienceTags: z.array(z.string()),
  maximumPriceLevel: z.number().int().min(1).max(5).nullable(),
  alcoholAllowed: z.boolean().nullable(),
  safetyConcern: z.boolean().nullable()
});

const buildUserContextSchema = z.object({
  context: userContextSchema,
  confidence: z.number().min(0).max(1)
});

export type BuildUserContextInput = {
  message: string;
  previousContext?: UserContext | null;
  previousAssistantMessage?: string | null;
  conversationHistory?: Array<{ direction: "incoming" | "outgoing"; message: string }>;
};

export type BuildUserContextResult = {
  context: UserContext;
  confidence: number;
};

function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function semanticRequestedSubcategory(
  parsed: string | null | undefined,
  previous: string | undefined,
  exclusions: string[],
  explicitlyRejected: boolean
): string | undefined {
  if (explicitlyRejected) return undefined;
  const candidate = nullToUndefined(parsed) ?? previous;
  if (!candidate) return undefined;
  return exclusions.some((value) => normalizeContextText(value) === normalizeContextText(candidate)) ? undefined : candidate;
}

function inferTravellerType(message: string): TravellerType | undefined {
  const lower = message.toLowerCase();

  if (/\b(solo|alone|alleen|seul|allein|alleine)\b/.test(lower)) return "solo";
  if (/\b(couple|koppel|partner|couple|paar)\b/.test(lower)) return "couple";
  if (/\b(friends|vrienden|amis|amies|freunde|freundinnen)\b/.test(lower)) return "friends";
  if (/\b(family|familie|famille)\b/.test(lower)) return "family";
  if (/\b(group|groep|groupe)\b/.test(lower)) return "group";
  if (/\b(business|work|werk|travail)\b/.test(lower)) return "business";
  if (/\b(romantic|romantisch|romantique|date night)\b/.test(lower)) return "couple";

  return undefined;
}

function isTravellerTypeOnly(message: string): boolean {
  return /^(?:solo|alone|alleen|seul|allein|alleine|couple|koppel|partner|paar|friends|vrienden|amis|amies|freunde|freundinnen|family|familie|famille|group|groep|groupe|business|work|werk|travail)[!,.?\s]*$/i.test(
    message.trim()
  );
}

function normalizeContextText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isKnownRegionOnly(message: string): boolean {
  const knownRegion = findKnownRegion(message);
  if (!knownRegion) return false;

  return normalizeContextText(message) === normalizeContextText(knownRegion);
}

function inferTiming(message: string): string | undefined {
  const lower = message.toLowerCase();

  if (/\b(morning|breakfast|ochtend|ontbijt|matin|petit déjeuner|frühstück)\b/.test(lower)) return "morning";
  if (/\b(lunch|noon|midday|middageten|lunchpauze|dejeuner|déjeuner|mittagessen)\b/.test(lower)) return "lunch";
  if (/\b(afternoon|middag|namiddag|après-midi|nachmittag)\b/.test(lower)) return "afternoon";
  if (/\b(evening|tonight|dinner|avond|vanavond|diner|soir|ce soir|dîner|abend|heute abend|abendessen)\b/.test(lower)) return "evening";
  if (/\b(now|nu|maintenant|jetzt)\b/.test(lower)) return "now";

  return undefined;
}

function acceptsAnyLocation(message: string): boolean {
  const lower = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return /\b(anywhere|anywhere in dakar|taxi anywhere|happy to take a taxi|does not matter|doesnt matter|it does not matter|it doesnt matter|no preference|wherever|maakt niet uit|het maakt niet uit|eender waar|taxi is goed|taxi mag|maakt me niet uit|maakt mij niet uit|peu importe|taxi partout|un taxi peut|n importe ou|n'importe ou|egal|gelijk waar)\b/.test(
    lower
  );
}

function acceptsBroaderLocation(message: string): boolean {
  const lower = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return /\b(another neighbourhood|another neighborhood|another area|another part of dakar|other neighbourhood|other neighborhood|different neighbourhood|different neighborhood|andere buurt|andere wijk|andere regio|andere plek|andere plaats|elders|autre quartier|autre zone|autre endroit|anderes viertel|andere gegend)\b/.test(
    lower
  );
}

function isBeachLocationPreference(message: string): boolean {
  const lower = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return /\b(at the beach|on the beach|by the beach|beach|op het strand|aan het strand|strand|a la plage|sur la plage|plage|am strand|strand)\b/.test(
    lower
  );
}

function inferRequestedSubcategory(message: string): string | undefined {
  const lower = normalizeContextText(message);
  if (/\b(work|working|remote work|cowork|coworking|laptop|werken|werkplek|thuiswerken|telewerken|travailler|travail|teletravail|arbeiten|arbeitsplatz)\b/.test(lower)) return "working";
  if (/\b(fitness|gym|workout|training|sportschool|salle de sport|fitnesstudio)\b/.test(lower)) return "fitness";
  if (/\b(surf|surfing|surfen|surfer)\b/.test(lower)) return "surfing";
  if (/\b(yoga)\b/.test(lower)) return "yoga";
  if (/\b(running|run|jogging|lopen|hardlopen|courir|course a pied|rennen|laufen)\b/.test(lower)) return "running";
  if (/\b(swim|swimming|zwemmen|natation|nager|schwimmen)\b/.test(lower)) return "swimming";

  if (/\b(breakfast|ontbijt|petit dejeuner|fruhstuck)\b/.test(lower)) return "breakfast";
  if (/\b(coffee|cafe|koffie|kaffee)\b/.test(lower)) return "coffee";
  if (/\b(pizza|pizzeria)\b/.test(lower) && !rejectsRequestedSubcategory(message, "pizza")) return "pizza";
  if (/\b(vegan|vegane|veganistisch)\b/.test(lower)) return "vegan";
  if (/\b(vegetarian|vegetarisch|vegetarien|vegetarienne)\b/.test(lower)) return "vegetarian";
  if (/\b(dessert|desserts|patisserie|gebak)\b/.test(lower)) return "dessert";
  if (/\b(crepe|crepes|pannenkoek|pannenkoeken)\b/.test(lower)) return "crêpes";
  if (/\b(chinese|chinees|chinois|chinesisch)\b/.test(lower)) return "chinese food";
  if (/\b(japanese|japans|japonais|japanisch)\b/.test(lower)) return "japanese food";
  if (/\b(mexican|mexicaans|mexicain|mexikanisch)\b/.test(lower)) return "mexican food";
  if (/\b(cocktail|cocktails)\b/.test(lower)) return "cocktails";
  if (/\b(karaoke)\b/.test(lower)) return "karaoke";
  if (/\b(bar|bars)\b/.test(lower)) return "bar";
  if (/\b(dance|dancing|dansen|danser|tanzen)\b/.test(lower)) return "dancing";
  if (/\b(walk|walking|hike|hiking|wandelen|promenade|marcher|randonnee|wandern)\b/.test(lower)) return "walking";
  if (/\b(excursion|tour|uitstap|ausflug)\b/.test(lower)) return "excursion";
  if (/\b(view|scenic|landscape|uitzicht|landschap|vue|paysage|aussicht|landschaft)\b/.test(lower)) return "scenic";

  if (isBeachLocationPreference(message)) return "beach";

  if (/\b(fish|fish market|seafood market|vis|vismarkt|poisson|poissons|poissonnerie|marche aux poissons|fisch|fischmarkt)\b/.test(lower)) {
    return "fish market";
  }
  if (/\b(handbag|handbags|bag|bags|handtas|handtassen|sac|sacs|sac a main|sacs a main)\b/.test(lower)) {
    return "handbags";
  }
  if (/\b(jewellery|jewelry|jewel|jewels|sieraden|juwelen|bijoux|schmuck)\b/.test(lower)) {
    return "jewellery";
  }
  if (/\b(wood|woodwork|wooden|hout|houtwerk|bois|holz|holzarbeit)\b/.test(lower)) {
    return "wood";
  }
  if (/\b(art|arts|artwork|artworks|artist|artists|kunst|kunstwerk|kunstwerken|galerie|gallery|galerij|oeuvre|oeuvres|museum|musee)\b/.test(lower)) {
    return "artworks";
  }
  if (/\b(music|musical|concert|live music|muziek|concerten|musique|musical|konzert|musik)\b/.test(lower)) {
    return "live music";
  }
  if (/\b(architecture|architectural|architectuur|architectuur|architektur|batiment|batiments|building|buildings)\b/.test(lower)) {
    return "architecture";
  }
  if (/\b(monument|monuments|memorial|monumental|standbeeld|standbeelden|denkmal|denkmaler)\b/.test(lower)) {
    return "monuments";
  }
  if (/\b(religious|religion|mosque|church|religieus|moskee|kerk|religieux|religieuse|mosquee|eglise|religios|moschee|kirche)\b/.test(lower)) {
    return "religious places";
  }

  return undefined;
}

export function rejectsRequestedSubcategory(message: string, subcategory?: string): boolean {
  if (!subcategory) return false;
  const lower = normalizeContextText(message);
  const aliases: Record<string, string> = {
    pizza: "pizza|pizzeria",
    bar: "bar|bars",
    cocktails: "cocktail|cocktails",
    coffee: "coffee|cafe|koffie|kaffee",
    breakfast: "breakfast|ontbijt|petit dejeuner|fruhstuck"
  };
  const target = aliases[subcategory] ?? subcategory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:geen|niet|zonder|no|not|without|pas de|pas|sans|ne veux pas|don'?t want)\\b(?:\\s+\\w+){0,3}\\s+\\b(?:${target})\\b`, "i").test(lower);
}

function inferRequestedStyle(message: string): string | undefined {
  const lower = normalizeContextText(message);
  if (/\b(international|internationaal|internationale|internationales|cosmopolitan|cosmopolitain)\b/.test(lower)) {
    return "international";
  }
  if (/\b(local|lokaal|lokale|locale|locales|lokal|authentic|authentiek|authentique)\b/.test(lower)) {
    return "local";
  }
  return undefined;
}

export function inferBudget(message: string): string | undefined {
  const lower = normalizeContextText(message);
  if (/\b(luxury|luxurious|luxe|luxueus|luxurios)\b/.test(lower)) {
    return "luxury";
  }
  if (/\b(upscale|chic|haut de gamme|duur|exclusief|gehoben)\b/.test(lower)) {
    return "upscale";
  }
  if (/\b(affordable|cheap|cheaper|budget|inexpensive|betaalbaar|goedkoop|moins cher|pas cher|abordable|gunstig|gunstig)\b/.test(lower)) {
    return "affordable";
  }
  if (/\b(mid range|midrange|average|gemiddeld|moyen|mittelklasse)\b/.test(lower)) return "mid-range";
  return undefined;
}

function hasExplicitActivityIntent(message: string): boolean {
  const lower = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return /\b(eat|food|restaurant|breakfast|brunch|lunch|dinner|pizza|pizzeria|drink|bar|cocktail|fitness|gym|workout|training|swim|surf|relax|walk|party|dance|eten|ontbijt|restaurant|diner|lunch|drinken|bar|fitness|gym|zwemmen|surfen|wandelen|manger|restaurant|petit dejeuner|dejeuner|diner|boire|fitness|gym|nager|surfer|marcher|essen|fruhstuck|restaurant|fitness|gym|trinken|schwimmen|spazieren)\b/.test(
    lower
  );
}

function isDirectRecommendationRequest(message: string): boolean {
  const lower = normalizeContextText(message);
  return /\b(waar kan ik|ik zoek|raad me|kan je .* aanraden|where can i|i am looking for|recommend me|can you recommend|ou puis je|je cherche|recommande moi|peux tu .* recommander|wo kann ich|ich suche|empfiehl mir|kannst du .* empfehlen)\b/.test(lower);
}

function inferHasChildren(message: string): boolean | undefined {
  const lower = message.toLowerCase();

  if (/\b(no children|geen kinderen|zonder kinderen|sans enfants|keine kinder|ohne kinder)\b/.test(lower)) return false;
  if (/\b(children|kids|kinderen|enfants|kinder)\b/.test(lower)) return true;

  return undefined;
}

function clearsIntent(message: string): boolean {
  const lower = message.toLowerCase();

  return /\b(niet|geen|zonder|not|no|without|pas|sans)\b.{0,24}\b(shop|shopping|winkel|winkelen|kopen|koop|boutique)\b/.test(lower);
}

export function mergeIntent(message: string, previousIntent?: UserIntent, parsedIntent?: UserIntent): UserIntent | undefined {
  if (clearsIntent(message)) return undefined;

  if (acceptsAnyLocation(message) && isBeachLocationPreference(message) && !hasExplicitActivityIntent(message)) {
    return parsedIntent === "beach" ? previousIntent : parsedIntent ?? previousIntent;
  }

  return detectIntent(message) ?? inferEmojiIntent(message) ?? parsedIntent ?? previousIntent;
}

export function resolveRequestedSubcategory(
  message: string,
  parsed: string | null | undefined,
  previous: string | undefined,
  exclusions: string[],
  explicitlyRejected: boolean
): string | undefined {
  return (
    inferRequestedSubcategory(message) ??
    semanticRequestedSubcategory(parsed, previous, exclusions, explicitlyRejected)
  );
}

export function inferRequestedAmenities(message: string): string[] {
  const lower = normalizeContextText(message);
  const amenities: string[] = [];

  if (/\b(air conditioning|airco|a c|climatisation|climatise|climatisee|klimaanlage)\b/.test(lower)) {
    amenities.push("air_conditioning");
  }
  if (/\b(wifi|wi fi|internet)\b/.test(lower)) amenities.push("wifi");
  if (/\b(power outlet|power outlets|electrical outlet|electrical outlets|plug socket|plug sockets|socket|sockets|stopcontact|stopcontacten|prise electrique|prises electriques|steckdose|steckdosen)\b/.test(lower)) {
    amenities.push("power_outlets");
  }
  if (/\b(indoor seating|inside seating|seats inside|zitplaatsen binnen|plaatsen binnen|binnen zitten|salle interieure|assis a l interieur|innenbereich)\b/.test(lower)) {
    amenities.push("indoor_seating");
  }

  return amenities;
}

function inferShoppingFocus(message: string): string | undefined {
  const lower = message.toLowerCase();

  if (/\b(handbag|handbags|bag|bags|handtas|handtassen|tas|tassen|sac|sacs)\b/.test(lower)) return "handbags";
  if (/\b(jewellery|jewelry|jewel|jewels|sieraden|juwelen|bijoux)\b/.test(lower)) return "jewellery";
  if (/\b(wood|woodwork|wooden|hout|houtwerk|bois)\b/.test(lower)) return "wood";
  if (/\b(art|artwork|artworks|kunst|kunstwerk|kunstwerken|oeuvre|oeuvres|œuvre|œuvres)\b/.test(lower)) return "artworks";

  return undefined;
}

function hasAnyEmoji(message: string, emojis: string[]): boolean {
  return emojis.some((emoji) => message.includes(emoji));
}

function inferEmojiIntent(message: string): UserIntent | undefined {
  if (hasAnyEmoji(message, ["🍽", "🍴", "🥘", "🍛", "🍜", "🍲", "🍤", "🍕", "🍔", "🌮", "🥗"])) return "food";
  if (hasAnyEmoji(message, ["🍷", "🍸", "🍹", "🍺", "🍻", "🥂", "☕"])) return "drink";
  if (hasAnyEmoji(message, ["🏖", "🏖️", "⛱", "⛱️", "🏝", "🏝️", "🌊", "☀", "☀️"])) return "beach";
  if (hasAnyEmoji(message, ["🎉", "🥳", "💃", "🕺", "🎶", "🎵", "🍾"])) return "nightlife";
  if (hasAnyEmoji(message, ["🎨", "🖼", "🖼️", "🏛", "🏛️", "📚"])) return "culture";
  if (hasAnyEmoji(message, ["🛍", "🛍️", "💍", "💎"])) return "shopping";
  if (hasAnyEmoji(message, ["🌿", "🌴", "🌳", "⛰", "⛰️"])) return "nature";
  if (hasAnyEmoji(message, ["⚽", "🏄‍♀️", "🏄", "🏃‍♀️", "🏃", "🚴"])) return "sports";

  return undefined;
}

function inferEmojiVibe(message: string): string | undefined {
  if (hasAnyEmoji(message, ["❤️", "❤", "💕", "💖", "💘", "💞", "💓", "😍", "🥰", "😘"])) return "romantic";
  if (hasAnyEmoji(message, ["🎉", "🥳", "💃", "🕺", "🎶", "🎵", "🍾"])) return "lively";
  if (hasAnyEmoji(message, ["🌅", "🌇", "✨"])) return "scenic";
  if (hasAnyEmoji(message, ["😌", "🧘"])) return "calm";

  return undefined;
}

export function inferTextVibe(message: string): string | undefined {
  const lower = message.toLowerCase();

  if (/\b(rasta|reggae|rastabar)\b/.test(lower)) return "rasta_reggae";
  if (/\b(quick|casual|informal|snelle|snel|informeel|rapide|decontracte|décontracté|locker)\b/.test(lower)) return "quick_casual";
  if (/\b(good italian|italian restaurant|goed italiaans|italiaans restaurant|bon restaurant italien|restaurant italien|gutes italienisches|italienisches restaurant)\b/.test(lower)) return "italian_restaurant";
  if (/\b(romantic|romantisch|romantique|romantisch)\b/.test(lower)) return "romantic";
  if (/\b(lively|gezellig|levendig|ambiance|animé|anime|lebendig)\b/.test(lower)) return "lively";
  if (/\b(calm|quiet|chill|chilled|chillen|rustig|calme|tranquille|ruhig)\b/.test(lower)) return "calm";
  if (/\b(sunset|zonsondergang|coucher du soleil|sonnenuntergang)\b/.test(lower)) return "scenic";
  return undefined;
}

export function inferContextualFoodStyle(message: string, requestedSubcategory?: string): string | undefined {
  if (requestedSubcategory !== "pizza") return undefined;

  const lower = normalizeContextText(message);
  if (/\b(bon restaurant|tres bon restaurant|restaurant italien|really good|good restaurant|italian restaurant|goed restaurant|echt goed|italiaans restaurant|gutes restaurant|italienisches restaurant)\b/.test(lower)) {
    return "italian_restaurant";
  }

  return undefined;
}

export function inferContextualBudget(message: string, requestedSubcategory?: string): string | undefined {
  if (requestedSubcategory !== "pizza") return undefined;

  const lower = normalizeContextText(message);
  if (/\b(bon restaurant|tres bon restaurant|restaurant italien|really good|good restaurant|italian restaurant|goed restaurant|echt goed|italiaans restaurant|gutes restaurant|italienisches restaurant)\b/.test(lower)) {
    return "upscale";
  }
  if (/\b(quick|casual|informal|fast|rapide|decontracte|snelle|snel|informeel|locker)\b/.test(lower)) {
    return "affordable";
  }

  return undefined;
}

function mergeVibe(
  message: string,
  previousVibe?: string,
  parsedVibe?: string,
  previousRequestedSubcategory?: string
): string | undefined {
  const contextualFoodStyle = inferContextualFoodStyle(message, previousRequestedSubcategory);
  if (contextualFoodStyle) return contextualFoodStyle;

  const atmosphereVibe = inferEmojiVibe(message) ?? inferTextVibe(message);
  if (atmosphereVibe) return atmosphereVibe;

  // Cultural and shopping types are subcategories, never atmospheres.
  const requestedSubcategory = inferRequestedSubcategory(message);
  if (requestedSubcategory && requestedSubcategory !== "beach") return undefined;

  const explicitVibe = inferShoppingFocus(message);
  if (explicitVibe) return explicitVibe;

  // A new hard place preference starts a fresh choice of atmosphere. In
  // particular, "eat at the beach" must not inherit a vibe from an older ask.
  if (requestedSubcategory) return undefined;

  return parsedVibe ?? previousVibe;
}

function mergeTravellerType(message: string, previousTravellerType?: TravellerType, parsedTravellerType?: TravellerType): TravellerType | undefined {
  if (["👨‍👩‍👧", "👨‍👩‍👧‍👦", "👩‍👩‍👧", "👨‍👨‍👧"].some((emoji) => message.includes(emoji))) {
    return "family";
  }

  if (/[👯]/u.test(message)) return "friends";

  return inferTravellerType(message) ?? parsedTravellerType ?? previousTravellerType;
}

function fallbackBuildUserContext(input: BuildUserContextInput): BuildUserContextResult {
  const previous = input.previousContext;
  const inferredRegion = findKnownRegion(input.message);
  const acceptsBroadLocation = acceptsAnyLocation(input.message) || acceptsBroaderLocation(input.message);
  const targetRegion = normalizeRegion(inferredRegion ?? (acceptsBroadLocation ? "Dakar" : previous?.targetRegion));
  const timing = inferTiming(input.message) ?? (acceptsAnyLocation(input.message) ? "flexible" : previous?.timing);
  const messageIsKnownRegionOnly = isKnownRegionOnly(input.message);

  const rejectsPreviousSubcategory = rejectsRequestedSubcategory(input.message, previous?.requestedSubcategory);
  const rejectedPizza = rejectsRequestedSubcategory(input.message, "pizza");
  const excludedSubcategories = new Set(previous?.excludedSubcategories ?? []);
  if (rejectedPizza) excludedSubcategories.add("pizza");
  const normalizedMessage = normalizeContextText(input.message);
  const dietaryExclusions = new Set(previous?.dietaryExclusions ?? []);
  if (/\b(?:geen|niet|zonder|no|not|without|pas de|sans)\b.{0,24}\b(?:vis|fish|seafood|poisson|fruits de mer)\b/.test(normalizedMessage)) dietaryExclusions.add("seafood");
  const avoidAudienceTags = new Set(previous?.avoidAudienceTags ?? []);
  if (/\b(?:geen|zonder|no|without|pas de|sans)\b.{0,24}\b(?:toeristen|tourists|touristes)\b/.test(normalizedMessage)) avoidAudienceTags.add("tourists");
  const noAlcohol = /\b(?:geen|zonder|no|without|pas d alcool|sans alcool)\b.{0,24}\b(?:alcohol|alcool)\b/.test(normalizedMessage);
  return {
    context: {
      ...previous,
      language: resolveConversationLanguage(input.message, previous?.language),
      targetRegion,
      travellerType: mergeTravellerType(input.message, previous?.travellerType),
      hasChildren: inferHasChildren(input.message) ?? previous?.hasChildren,
      intent: mergeIntent(input.message, previous?.intent),
      timing,
      budget:
        inferBudget(input.message) ??
        inferContextualBudget(input.message, previous?.requestedSubcategory) ??
        previous?.budget,
      requestedSubcategory: rejectsPreviousSubcategory
        ? inferRequestedSubcategory(input.message)
        : inferRequestedSubcategory(input.message) ?? previous?.requestedSubcategory,
      requestedStyle: inferRequestedStyle(input.message) ?? previous?.requestedStyle,
      requestedAmenities: [
        ...new Set([...(previous?.requestedAmenities ?? []), ...inferRequestedAmenities(input.message)])
      ],
      vibe: messageIsKnownRegionOnly
        ? previous?.vibe
        : mergeVibe(input.message, previous?.vibe, undefined, previous?.requestedSubcategory),
      excludedCategories: previous?.excludedCategories ?? [],
      excludedSubcategories: [...excludedSubcategories],
      dietaryExclusions: [...dietaryExclusions],
      avoidAudienceTags: [...avoidAudienceTags],
      maximumPriceLevel: /\b(niet te duur|not too expensive|pas trop cher)\b/.test(normalizedMessage) ? 2 : previous?.maximumPriceLevel,
      alcoholAllowed: noAlcohol ? false : previous?.alcoholAllowed,
      directRequest: isDirectRecommendationRequest(input.message) || undefined
    },
    confidence: 0.55
  };
}

export async function buildUserContext(input: BuildUserContextInput): Promise<BuildUserContextResult> {
  const explicitRegion = findKnownRegion(input.message);
  const broadTargetRegion = acceptsAnyLocation(input.message) || acceptsBroaderLocation(input.message) ? "Dakar" : undefined;
  const messageIsKnownRegionOnly = isKnownRegionOnly(input.message);

  if (!hasOpenAIKey() || isTravellerTypeOnly(input.message)) {
    return fallbackBuildUserContext(input);
  }

  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: openaiModel,
    instructions: `${systemPrompt}

Extract updated user travel context as JSON.
Rules:
- Keep previous context unless the user clearly changes it.
- Read the complete meaning of the sentence. Negated concepts are exclusions, never positive requests.
- "no pizza" means pizza belongs in excludedSubcategories and requestedSubcategory must not be pizza.
- "not too expensive" means maximumPriceLevel is 2, not an upscale preference.
- "where no tourists go" means tourists belongs in avoidAudienceTags.
- "no alcohol" means alcoholAllowed is false.
- Corrections replace conflicting older preferences. If the user says "not pizza, just a chilled drink", set intent to drink, vibe to calm, exclude pizza and clear the old pizza subcategory.
- Keep exclusions until the user explicitly reverses them or the conversation is reset.
- Interpret short replies in the context of the previous assistant message. A short reply often selects one of the options in that question.
- Do not require the user to repeat the exact wording of an option. Resolve natural synonyms and partial answers semantically.
- Examples: after a pizza-style question, "bon restaurant" means the good Italian restaurant option; after a children question, "oui" means children are joining; after a location question, "n’importe où" means Dakar-wide mobility.
- Preserve the existing conversation language. Only change it when the user explicitly requests another language.
- Normalize known Senegal regions.
- Use "unknown" for unclear travellerType or intent.
- Use "unknown" for unclear timing.
- Treat beach/plage/strand as requestedSubcategory, not as vibe.
- Store local/international as requestedStyle, not as vibe.
- Store explicitly requested facilities in requestedAmenities using only air_conditioning, wifi, power_outlets or indoor_seating.
- Normalize price preference to affordable, mid-range, upscale or luxury in budget.
- Vibe describes atmosphere such as calm, lively or romantic.
- Do not assume children are present.
- Do not assume a place is child-friendly.`,
    input: JSON.stringify({
      message: input.message,
      previousContext: input.previousContext ?? null,
      previousAssistantMessage: input.previousAssistantMessage ?? null,
      recentConversation: input.conversationHistory ?? []
    }),
    text: {
      format: zodTextFormat(buildUserContextSchema, "build_user_context")
    }
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    return fallbackBuildUserContext(input);
  }

  const rejectsPreviousSubcategory = rejectsRequestedSubcategory(input.message, input.previousContext?.requestedSubcategory);
  const semanticExclusions = parsed.context.excludedSubcategories;
  return {
    context: {
      language: resolveConversationLanguage(
        input.message,
        input.previousContext?.language,
        parsed.context.language
      ),
      currentLocation: normalizeRegion(
        nullToUndefined(parsed.context.currentLocation) ?? input.previousContext?.currentLocation
      ),
      targetRegion: normalizeRegion(
        explicitRegion ?? broadTargetRegion ?? nullToUndefined(parsed.context.targetRegion) ?? input.previousContext?.targetRegion
      ),
      travellerType:
        mergeTravellerType(
          input.message,
          input.previousContext?.travellerType,
          nullToUndefined(parsed.context.travellerType) as TravellerType | undefined
        ),
      hasChildren: inferHasChildren(input.message) ?? nullToUndefined(parsed.context.hasChildren) ?? input.previousContext?.hasChildren,
      childrenAges: nullToUndefined(parsed.context.childrenAges) ?? input.previousContext?.childrenAges,
      intent: messageIsKnownRegionOnly
        ? input.previousContext?.intent
        : mergeIntent(
            input.message,
            input.previousContext?.intent,
            nullToUndefined(parsed.context.intent) as UserIntent | undefined
          ),
      timing: inferTiming(input.message) ?? (acceptsAnyLocation(input.message) ? "flexible" : input.previousContext?.timing),
      budget:
        inferBudget(input.message) ??
        inferContextualBudget(input.message, input.previousContext?.requestedSubcategory) ??
        nullToUndefined(parsed.context.budget) ??
        input.previousContext?.budget,
      requestedSubcategory:
        resolveRequestedSubcategory(
          input.message,
          parsed.context.requestedSubcategory,
          input.previousContext?.requestedSubcategory,
          semanticExclusions,
          rejectsPreviousSubcategory
        ),
      requestedStyle: nullToUndefined(parsed.context.requestedStyle) ?? input.previousContext?.requestedStyle,
      requestedAmenities: [
        ...new Set([
          ...(input.previousContext?.requestedAmenities ?? []),
          ...parsed.context.requestedAmenities,
          ...inferRequestedAmenities(input.message)
        ])
      ],
      vibe: messageIsKnownRegionOnly
        ? input.previousContext?.vibe
        : mergeVibe(
            input.message,
            input.previousContext?.vibe,
            nullToUndefined(parsed.context.vibe),
            input.previousContext?.requestedSubcategory
          ),
      safetyConcern: nullToUndefined(parsed.context.safetyConcern) ?? input.previousContext?.safetyConcern,
      excludedCategories: parsed.context.excludedCategories,
      excludedSubcategories: semanticExclusions,
      dietaryExclusions: parsed.context.dietaryExclusions,
      avoidAudienceTags: parsed.context.avoidAudienceTags,
      maximumPriceLevel: nullToUndefined(parsed.context.maximumPriceLevel) as UserContext["maximumPriceLevel"],
      alcoholAllowed: nullToUndefined(parsed.context.alcoholAllowed),
      directRequest: isDirectRecommendationRequest(input.message) || undefined,
      clarificationCount: input.previousContext?.clarificationCount ?? 0
    },
    confidence: parsed.confidence
  };
}
