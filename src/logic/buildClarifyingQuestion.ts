import type { MissingContextField } from "./needsClarification.js";
import type { UserContext } from "../types/userContext.js";

const questions: Record<string, Record<MissingContextField, string>> = {
  nl: {
    location: "Waar ben je nu, of naar welke buurt/regio wil je gaan?",
    travellerType: "Met wie reis je: solo, als koppel, met vrienden of met familie?",
    children: "Zijn er kinderen bij, en zo ja welke leeftijden ongeveer?",
    intent: "Waar heb je zin in: eten, cultuur, sport, strand, natuur, iets drinken of iets anders?",
    timing: "Wanneer wil je gaan: ochtend, middag, avond of vanavond?"
  },
  fr: {
    location: "Tu es où maintenant, ou vers quel quartier/région tu veux aller ?",
    travellerType: "Tu voyages solo, en couple, avec des amis ou en famille ?",
    children: "Il y a des enfants avec toi, et si oui quel âge environ ?",
    intent: "Tu cherches plutôt à manger, culture, sport, plage, nature, boire un verre ou autre chose ?",
    timing: "Tu veux y aller quand : matin, après-midi, soir ou ce soir ?"
  },
  de: {
    location: "Wo bist du gerade, oder in welches Viertel/welche Region möchtest du?",
    travellerType: "Reist du solo, als Paar, mit Freunden oder mit Familie?",
    children: "Sind Kinder dabei, und wenn ja, ungefähr wie alt?",
    intent: "Worauf hast du Lust: Essen, Kultur, Sport, Strand, Natur, etwas trinken oder etwas anderes?",
    timing: "Wann möchtest du gehen: morgens, nachmittags, abends oder heute Abend?"
  },
  en: {
    location: "Where are you now, or which neighbourhood or region do you want to go to?",
    travellerType: "Who are you travelling with: solo, as a couple, with friends, or family?",
    children: "Are there children with you, and roughly how old are they?",
    intent: "What are you in the mood for: food, culture, sport, beach, nature, drinks, or something else?",
    timing: "When do you want to go: morning, afternoon, evening, or tonight?"
  }
};

function languageKey(language: string | undefined): "nl" | "fr" | "de" | "en" {
  if (language?.startsWith("nl")) return "nl";
  if (language?.startsWith("fr")) return "fr";
  if (language?.startsWith("de")) return "de";
  return "en";
}

export function buildClarifyingQuestion(field: MissingContextField, context: UserContext): string {
  return questions[languageKey(context.language)][field];
}
