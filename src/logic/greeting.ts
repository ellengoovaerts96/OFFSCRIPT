import type { UserContext } from "../types/userContext.js";

const GREETING_ONLY_PATTERN =
  /^(?:hallo|hoi|hey|hi|hello|bonjour|bonsoir|salut|goedemorgen|goedemiddag|goedenavond)[!,.?\s]*$/i;

export function isGreetingOnly(message: string): boolean {
  return GREETING_ONLY_PATTERN.test(message.trim());
}

export function buildGreetingResponse(context: UserContext): string {
  if (context.language.startsWith("nl")) {
    return "Na Nga def? Reis je alleen, als koppel, met vrienden of met familie?";
  }

  if (context.language.startsWith("fr")) {
    return "Na Nga def? Tu voyages seul, en couple, avec des amis ou en famille ?";
  }

  return "Na Nga def? Are you travelling solo, as a couple, with friends, or with family?";
}
