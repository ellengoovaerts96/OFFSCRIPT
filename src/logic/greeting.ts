import type { UserContext } from "../types/userContext.js";
import { buildClarifyingQuestion } from "./buildClarifyingQuestion.js";
import { needsClarification } from "./needsClarification.js";

const GREETING_ONLY_PATTERN =
  /^(?:hallo|hoi|hey|hi|hello|bonjour|bonsoir|salut|goedemorgen|goedemiddag|goedenavond)[!,.?\s]*$/i;

export function isGreetingOnly(message: string): boolean {
  return GREETING_ONLY_PATTERN.test(message.trim());
}

export function buildGreetingResponse(context: UserContext): string {
  const missingField = needsClarification(context);

  if (missingField) {
    return `Na nga def? ${buildClarifyingQuestion(missingField, context)}`;
  }

  if (context.language.startsWith("nl")) {
    return "Na nga def? Waar heb je zin in vandaag: eten, cultuur, sport, natuur, iets drinken of iets anders?";
  }

  if (context.language.startsWith("fr")) {
    return "Na nga def? Tu as envie de quoi aujourd’hui : manger, culture, sport, nature, boire un verre ou autre chose ?";
  }

  if (context.language.startsWith("de")) {
    return "Na nga def? Worauf hast du heute Lust: Essen, Kultur, Sport, Natur, etwas trinken oder etwas anderes?";
  }

  return "Na nga def? What are you in the mood for today: food, culture, sport, nature, drinks, or something else?";
}
