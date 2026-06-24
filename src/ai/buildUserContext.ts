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

  return undefined;
}

function isTravellerTypeOnly(message: string): boolean {
  return /^(?:solo|alone|alleen|seul|allein|alleine|couple|koppel|partner|paar|friends|vrienden|amis|amies|freunde|freundinnen|family|familie|famille|group|groep|groupe|business|work|werk|travail)[!,.?\s]*$/i.test(
    message.trim()
  );
}

function inferTiming(message: string): string | undefined {
  const lower = message.toLowerCase();

  if (/\b(morning|ochtend|matin)\b/.test(lower)) return "morning";
  if (/\b(afternoon|middag|namiddag|après-midi|nachmittag)\b/.test(lower)) return "afternoon";
  if (/\b(evening|tonight|avond|vanavond|soir|ce soir|abend|heute abend)\b/.test(lower)) return "evening";
  if (/\b(now|nu|maintenant|jetzt)\b/.test(lower)) return "now";

  return undefined;
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
  return detectIntent(message) ?? parsedIntent ?? previousIntent;
}

function inferShoppingFocus(message: string): string | undefined {
  const lower = message.toLowerCase();

  if (/\b(handbag|handbags|bag|bags|handtas|handtassen|tas|tassen|sac|sacs)\b/.test(lower)) return "handbags";
  if (/\b(jewellery|jewelry|jewel|jewels|sieraden|juwelen|bijoux)\b/.test(lower)) return "jewellery";
  if (/\b(wood|woodwork|wooden|hout|houtwerk|bois)\b/.test(lower)) return "wood";
  if (/\b(art|artwork|artworks|kunst|kunstwerk|kunstwerken|oeuvre|oeuvres|œuvre|œuvres)\b/.test(lower)) return "artworks";

  return undefined;
}

function mergeVibe(message: string, previousVibe?: string, parsedVibe?: string): string | undefined {
  return inferShoppingFocus(message) ?? parsedVibe ?? previousVibe;
}

function fallbackBuildUserContext(input: BuildUserContextInput): BuildUserContextResult {
  const previous = input.previousContext;
  const inferredRegion = findKnownRegion(input.message);

  return {
    context: {
      ...previous,
      language: detectLanguage(input.message, previous?.language),
      targetRegion: normalizeRegion(inferredRegion ?? previous?.targetRegion),
      travellerType: inferTravellerType(input.message) ?? previous?.travellerType,
      hasChildren: inferHasChildren(input.message) ?? previous?.hasChildren,
      intent: mergeIntent(input.message, previous?.intent),
      timing: inferTiming(input.message) ?? previous?.timing,
      vibe: mergeVibe(input.message, previous?.vibe)
    },
    confidence: 0.55
  };
}

export async function buildUserContext(input: BuildUserContextInput): Promise<BuildUserContextResult> {
  const explicitRegion = findKnownRegion(input.message);

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
        explicitRegion ?? nullToUndefined(parsed.context.targetRegion) ?? input.previousContext?.targetRegion
      ),
      travellerType:
        inferTravellerType(input.message) ??
        (nullToUndefined(parsed.context.travellerType) as TravellerType | undefined) ??
        input.previousContext?.travellerType,
      hasChildren: inferHasChildren(input.message) ?? nullToUndefined(parsed.context.hasChildren) ?? input.previousContext?.hasChildren,
      childrenAges: nullToUndefined(parsed.context.childrenAges) ?? input.previousContext?.childrenAges,
      intent: mergeIntent(
        input.message,
        input.previousContext?.intent,
        nullToUndefined(parsed.context.intent) as UserIntent | undefined
      ),
      timing: inferTiming(input.message) ?? input.previousContext?.timing,
      budget: nullToUndefined(parsed.context.budget) ?? input.previousContext?.budget,
      vibe: mergeVibe(input.message, input.previousContext?.vibe, nullToUndefined(parsed.context.vibe)),
      safetyConcern: nullToUndefined(parsed.context.safetyConcern) ?? input.previousContext?.safetyConcern
    },
    confidence: parsed.confidence
  };
}
