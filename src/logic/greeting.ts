import type { UserContext } from "../types/userContext.js";
import { buildClarifyingQuestion } from "./buildClarifyingQuestion.js";
import { needsClarification } from "./needsClarification.js";

const GREETING_ONLY_PATTERN =
  /^(?:hallo|hoi|hey|hi|hello|bonjour|bonsoir|salut|goedemorgen|goedemiddag|goedenavond)[!,.?\s]*$/i;

export function isGreetingOnly(message: string): boolean {
  return GREETING_ONLY_PATTERN.test(message.trim());
}

export function buildGreetingResponse(context: UserContext, options: { useWolofGreeting?: boolean } = {}): string {
  const missingField = needsClarification(context);
  const prefix = options.useWolofGreeting ? "Na nga def? " : "";

  if (missingField) {
    return `${prefix}${buildClarifyingQuestion(missingField, context)}`;
  }

  if (context.language.startsWith("nl")) {
    return `${prefix}Waar heb je zin in vandaag: eten, cultuur, sport, natuur, iets drinken of iets anders?`;
  }

  if (context.language.startsWith("fr")) {
    return `${prefix}Tu as envie de quoi aujourd’hui : manger, culture, sport, nature, boire un verre ou autre chose ?`;
  }

  if (context.language.startsWith("de")) {
    return `${prefix}Worauf hast du heute Lust: Essen, Kultur, Sport, Natur, etwas trinken oder etwas anderes?`;
  }

  return `${prefix}What are you in the mood for today: food, culture, sport, nature, drinks, or something else?`;
}
