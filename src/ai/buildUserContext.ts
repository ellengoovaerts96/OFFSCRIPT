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

  if (/\b(solo|alone|alleen|seul)\b/.test(lower)) return "solo";
  if (/\b(couple|koppel|partner|couple)\b/.test(lower)) return "couple";
  if (/\b(friends|vrienden|amis|amies)\b/.test(lower)) return "friends";
  if (/\b(family|familie|famille)\b/.test(lower)) return "family";
  if (/\b(group|groep|groupe)\b/.test(lower)) return "group";
  if (/\b(business|work|werk|travail)\b/.test(lower)) return "business";

  return undefined;
}

function inferTiming(message: string): string | undefined {
  const lower = message.toLowerCase();

  if (/\b(morning|ochtend|matin)\b/.test(lower)) return "morning";
  if (/\b(afternoon|middag|après-midi)\b/.test(lower)) return "afternoon";
  if (/\b(evening|tonight|avond|vanavond|soir|ce soir)\b/.test(lower)) return "evening";
  if (/\b(now|nu|maintenant)\b/.test(lower)) return "now";

  return undefined;
}

function inferHasChildren(message: string): boolean | undefined {
  const lower = message.toLowerCase();

  if (/\b(no children|geen kinderen|zonder kinderen|sans enfants)\b/.test(lower)) return false;
  if (/\b(children|kids|kinderen|enfants)\b/.test(lower)) return true;

  return undefined;
}

function fallbackBuildUserContext(input: BuildUserContextInput): BuildUserContextResult {
  const previous = input.previousContext;
  const inferredRegion = findKnownRegion(input.message);

  return {
    context: {
      ...previous,
      language: detectLanguage(input.message),
      targetRegion: normalizeRegion(inferredRegion ?? previous?.targetRegion),
      travellerType: inferTravellerType(input.message) ?? previous?.travellerType,
      hasChildren: inferHasChildren(input.message) ?? previous?.hasChildren,
      intent: detectIntent(input.message) ?? previous?.intent,
      timing: inferTiming(input.message) ?? previous?.timing
    },
    confidence: 0.55
  };
}

export async function buildUserContext(input: BuildUserContextInput): Promise<BuildUserContextResult> {
  const explicitRegion = findKnownRegion(input.message);

  if (!hasOpenAIKey()) {
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
      language: parsed.context.language,
      currentLocation: normalizeRegion(nullToUndefined(parsed.context.currentLocation)),
      targetRegion: normalizeRegion(explicitRegion ?? nullToUndefined(parsed.context.targetRegion)),
      travellerType: nullToUndefined(parsed.context.travellerType) as TravellerType | undefined,
      hasChildren: nullToUndefined(parsed.context.hasChildren),
      childrenAges: nullToUndefined(parsed.context.childrenAges),
      intent: nullToUndefined(parsed.context.intent) as UserIntent | undefined,
      timing: nullToUndefined(parsed.context.timing),
      budget: nullToUndefined(parsed.context.budget),
      vibe: nullToUndefined(parsed.context.vibe),
      safetyConcern: nullToUndefined(parsed.context.safetyConcern)
    },
    confidence: parsed.confidence
  };
}
