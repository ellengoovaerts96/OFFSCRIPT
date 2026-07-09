import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient, hasOpenAIKey, openaiModel } from "../integrations/openai.js";
import type { TravellerType, UserContext, UserIntent } from "../types/userContext.js";
import { findKnownRegion, normalizeRegion } from "../utils/normalizeRegion.js";
import { detectIntent } from "./detectIntent.js";
import { detectLanguage } from "./detectLanguage.js";
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
  vibe: z.string().nullable(),
  safetyConcern: z.boolean().nullable()
});

const buildUserContextSchema = z.object({
  context: userContextSchema,
  confidence: z.number().min(0).max(1)
});

export type BuildUserContextInput = {
  message: string;
  previousContext?: UserContext | null;
};

export type BuildUserContextResult = {
  context: UserContext;
  confidence: number;
};

function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
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

  if (/\b(morning|ochtend|matin)\b/.test(lower)) return "morning";
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

  return /\b(anywhere|anywhere in dakar|does not matter|doesnt matter|it does not matter|it doesnt matter|no preference|wherever|maakt niet uit|het maakt niet uit|eender waar|maakt me niet uit|maakt mij niet uit|peu importe|n importe ou|n'importe ou|egal|gelijk waar)\b/.test(
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

function hasExplicitActivityIntent(message: string): boolean {
  const lower = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return /\b(eat|food|restaurant|dinner|lunch|drink|bar|cocktail|swim|surf|relax|walk|party|dance|eten|restaurant|diner|lunch|drinken|bar|zwemmen|surfen|wandelen|manger|restaurant|dejeuner|diner|boire|nager|surfer|marcher|essen|restaurant|trinken|schwimmen|spazieren)\b/.test(
    lower
  );
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

function mergeIntent(message: string, previousIntent?: UserIntent, parsedIntent?: UserIntent): UserIntent | undefined {
  if (clearsIntent(message)) return undefined;

  if (acceptsAnyLocation(message) && isBeachLocationPreference(message) && !hasExplicitActivityIntent(message)) {
    return parsedIntent === "beach" ? previousIntent : parsedIntent ?? previousIntent;
  }

  return detectIntent(message) ?? inferEmojiIntent(message) ?? parsedIntent ?? previousIntent;
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

function inferTextVibe(message: string): string | undefined {
  const lower = message.toLowerCase();

  if (/\b(romantic|romantisch|romantique|romantisch)\b/.test(lower)) return "romantic";
  if (/\b(lively|gezellig|levendig|ambiance|animé|anime|lebendig)\b/.test(lower)) return "lively";
  if (/\b(calm|quiet|rustig|calme|ruhig)\b/.test(lower)) return "calm";
  if (/\b(sunset|zonsondergang|coucher du soleil|sonnenuntergang)\b/.test(lower)) return "scenic";
  if (isBeachLocationPreference(message)) return "beach";

  return undefined;
}

function mergeVibe(message: string, previousVibe?: string, parsedVibe?: string): string | undefined {
  return inferShoppingFocus(message) ?? inferEmojiVibe(message) ?? inferTextVibe(message) ?? parsedVibe ?? previousVibe;
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
  const targetRegion = normalizeRegion(inferredRegion ?? (acceptsAnyLocation(input.message) ? "Dakar" : previous?.targetRegion));
  const timing = inferTiming(input.message) ?? (acceptsAnyLocation(input.message) ? "flexible" : previous?.timing);
  const messageIsKnownRegionOnly = isKnownRegionOnly(input.message);

  return {
    context: {
      ...previous,
      language: detectLanguage(input.message, previous?.language),
      targetRegion,
      travellerType: mergeTravellerType(input.message, previous?.travellerType),
      hasChildren: inferHasChildren(input.message) ?? previous?.hasChildren,
      intent: mergeIntent(input.message, previous?.intent),
      timing,
      vibe: messageIsKnownRegionOnly ? previous?.vibe : mergeVibe(input.message, previous?.vibe)
    },
    confidence: 0.55
  };
}

export async function buildUserContext(input: BuildUserContextInput): Promise<BuildUserContextResult> {
  const explicitRegion = findKnownRegion(input.message);
  const broadTargetRegion = acceptsAnyLocation(input.message) ? "Dakar" : undefined;
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
- Use the latest message to detect language.
- Normalize known Senegal regions.
- Use "unknown" for unclear travellerType or intent.
- Use "unknown" for unclear timing.
- Do not assume children are present.
- Do not assume a place is child-friendly.`,
    input: JSON.stringify({
      message: input.message,
      previousContext: input.previousContext ?? null
    }),
    text: {
      format: zodTextFormat(buildUserContextSchema, "build_user_context")
    }
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    return fallbackBuildUserContext(input);
  }

  return {
    context: {
      language: detectLanguage(input.message, input.previousContext?.language ?? parsed.context.language),
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
      intent: mergeIntent(
        input.message,
        input.previousContext?.intent,
        messageIsKnownRegionOnly ? undefined : (nullToUndefined(parsed.context.intent) as UserIntent | undefined)
      ),
      timing: inferTiming(input.message) ?? (broadTargetRegion ? "flexible" : input.previousContext?.timing),
      budget: nullToUndefined(parsed.context.budget) ?? input.previousContext?.budget,
      vibe: messageIsKnownRegionOnly
        ? input.previousContext?.vibe
        : mergeVibe(input.message, input.previousContext?.vibe, nullToUndefined(parsed.context.vibe)),
      safetyConcern: nullToUndefined(parsed.context.safetyConcern) ?? input.previousContext?.safetyConcern
    },
    confidence: parsed.confidence
  };
}
