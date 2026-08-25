import { detectIntent } from "../ai/detectIntent.js";
import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { recognizeSearchProfileSignals } from "./buildSearchProfile.js";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAlternativeRequest(message: string): boolean {
  return /^(?:un(?:e)? autre|autre option|encore une|another|another one|other option|something else|een andere|andere optie|nog een|iets anders|eine andere|andere option)[!,.?\s]*$/i.test(
    message.trim()
  );
}

export function isFrustratedReply(message: string): boolean {
  const text = normalize(message);
  return /^(?:con|connard|conne|idiot|imbecile|stupide|tu es con|tu es tellement con|tu n es pas intelligent|dom|stom|idioot|jij bent dom|you are stupid|stupid|idiot|this is frustrating|dit is frustrerend|ca ne marche pas|cela ne marche pas)/.test(
    text
  );
}

export function findExplicitPlaceRequest(message: string, places: Place[]): Place | undefined {
  const text = normalize(message)
    .replace(/^(?:et|en|and|what about|wat met|que penses tu de)\s+/, "")
    .trim();

  return places
    .filter((place) => normalize(place.name).length >= 4)
    .sort((left, right) => right.name.length - left.name.length)
    .find((place) => {
      const name = normalize(place.name);
      return (
        text === name ||
        text === `${name} alors` ||
        text === `${name} peut etre` ||
        text.includes(` ${name} `) ||
        text.startsWith(`${name} `) ||
        text.endsWith(` ${name}`)
      );
    });
}

function hasConcreteSearchSignal(message: string): boolean {
  const neutralContext: UserContext = { language: "unknown" };
  const signals = recognizeSearchProfileSignals(message, neutralContext);
  return Boolean(
    detectIntent(message) ||
      (signals.activity && signals.activity !== "unknown") ||
      signals.products.length ||
      signals.locationFeatures.length ||
      signals.occasions.length
  );
}

function isShortPreferenceOrAnswer(message: string): boolean {
  const text = normalize(message);
  return (
    /^(?:budget|budgetvriendelijk|petit budget|betaalbaar|abordable|affordable|gemiddeld|moyen|mid range|chic|luxe|luxury|overal|eender waar|n importe ou|anywhere)$/.test(
      text
    ) ||
    /^(?:plus typique|typique|local|lokaal|international|internationaal|calm|calme|rustig)$/.test(
      text
    )
  );
}

export function startsNewSearch(message: string, previousContext?: UserContext | null): boolean {
  if (!previousContext || isAlternativeRequest(message) || isShortPreferenceOrAnswer(message)) {
    return false;
  }

  return hasConcreteSearchSignal(message);
}

export function contextForNewSearch(
  previousContext: UserContext | null | undefined,
  language: string
): UserContext {
  return {
    language,
    travellerType: previousContext?.travellerType,
    hasChildren: previousContext?.hasChildren,
    childrenAges: previousContext?.childrenAges,
    dietaryExclusions: previousContext?.dietaryExclusions,
    alcoholAllowed: previousContext?.alcoholAllowed,
    safetyConcern: previousContext?.safetyConcern,
    clarificationCount: 0
  };
}

export function buildFrustrationRecovery(context: UserContext): string {
  if (context.language.startsWith("nl")) {
    return "Je hebt gelijk: dit liep niet goed. Zeg gewoon opnieuw wat je nu zoekt; ik begin met een schone lei en houd oude filters niet vast.";
  }
  if (context.language.startsWith("fr")) {
    return "Tu as raison, je me suis mal débrouillé. Dis-moi simplement ce que tu cherches maintenant : je repars de zéro sans garder les anciens filtres.";
  }
  if (context.language.startsWith("de")) {
    return "Du hast recht, das lief nicht gut. Sag mir einfach noch einmal, was du jetzt suchst; ich beginne ohne die alten Filter neu.";
  }
  return "You are right: that did not go well. Just tell me what you are looking for now; I will start fresh without carrying over the old filters.";
}
