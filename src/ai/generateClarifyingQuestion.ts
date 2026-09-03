import { getOpenAIClient, hasOpenAIKey, openaiModel } from "../integrations/openai.js";
import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { buildClarifyingQuestion } from "../logic/buildClarifyingQuestion.js";
import type { MissingContextField } from "../logic/needsClarification.js";

const CLARIFICATION_TIMEOUT_MS = 5_000;

function languageName(language: string): string {
  if (language.startsWith("nl")) return "Dutch";
  if (language.startsWith("fr")) return "French";
  if (language.startsWith("de")) return "German";
  return "British English";
}

export async function generateClarifyingQuestion(input: {
  missingField: MissingContextField;
  context: UserContext;
  candidates: Place[];
}): Promise<string> {
  const fallback = buildClarifyingQuestion(input.missingField, input.context);
  if (!hasOpenAIKey()) return fallback;

  const subcategories = [...new Set(
    input.candidates.flatMap((place) => place.subcategories.map((subcategory) => subcategory.name))
  )].slice(0, 30);

  try {
    const response = await getOpenAIClient().responses.create({
      model: openaiModel,
      instructions: `Write exactly one short, friendly clarification question in ${languageName(input.context.language)}.
The application has determined that ${input.missingField} is the one material detail still needed to choose between verified places.
Ask only about that detail. Do not combine it with another question, recommend a place, mention budget unless missingField is budget, or list every available option.
Use the supplied database subcategories to offer a few meaningful contrasts in natural language.
For coffee, ask only for the broad preference: local coffee such as Café Touba, or international-style coffee. Do not ask the user to choose between espresso, cappuccino, latte or other individual preparations.
For food, distinguish local Senegalese food, international food or a specific cuisine and briefly allow dietary needs.
For drinks, distinguish the relevant drink type or whether atmosphere matters most.
For culture, nightlife, activities and work, use only distinctions relevant to that intent and the supplied database choices.
Sound like a knowledgeable friend, not a form or scripted menu. Output the question only.`,
      input: JSON.stringify({
        travellerContext: input.context,
        availableSubcategories: subcategories
      })
    }, {
      timeout: CLARIFICATION_TIMEOUT_MS,
      maxRetries: 0,
      signal: AbortSignal.timeout(CLARIFICATION_TIMEOUT_MS)
    });
    return response.output_text.trim() || fallback;
  } catch (error) {
    console.error("Clarifying-question generation failed; using fallback", error);
    return fallback;
  }
}
