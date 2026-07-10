import type { MissingContextField } from "./needsClarification.js";
import type { UserContext } from "../types/userContext.js";

const questions: Record<string, Record<MissingContextField, string>> = {
  nl: {
    location: "Waar ben je nu, of naar welke buurt/regio wil je gaan?",
    travellerType: "Met wie reis je: solo, als koppel, met vrienden of met familie?",
    children: "Zijn er kinderen bij, en zo ja welke leeftijden ongeveer?",
    intent: "Waar heb je zin in: eten, cultuur, sport, strand, natuur, iets drinken of iets anders?",
    vibe: "Welke vibe of subcategorie zoek je?",
    timing: "Wanneer wil je gaan: ochtend, middag, avond of vanavond?"
  },
  fr: {
    location: "Tu es où maintenant, ou vers quel quartier/région tu veux aller ?",
    travellerType: "Tu voyages solo, en couple, avec des amis ou en famille ?",
    children: "Il y a des enfants avec toi, et si oui quel âge environ ?",
    intent: "Tu cherches plutôt à manger, culture, sport, plage, nature, boire un verre ou autre chose ?",
    vibe: "Tu cherches quelle ambiance ou sous-catégorie ?",
    timing: "Tu veux y aller quand : matin, après-midi, soir ou ce soir ?"
  },
  de: {
    location: "Wo bist du gerade, oder in welches Viertel/welche Region möchtest du?",
    travellerType: "Reist du solo, als Paar, mit Freunden oder mit Familie?",
    children: "Sind Kinder dabei, und wenn ja, ungefähr wie alt?",
    intent: "Worauf hast du Lust: Essen, Kultur, Sport, Strand, Natur, etwas trinken oder etwas anderes?",
    vibe: "Welche Stimmung oder Unterkategorie suchst du?",
    timing: "Wann möchtest du gehen: morgens, nachmittags, abends oder heute Abend?"
  },
  en: {
    location: "Where are you now, or which neighbourhood or region do you want to go to?",
    travellerType: "Who are you travelling with: solo, as a couple, with friends, or family?",
    children: "Are there children with you, and roughly how old are they?",
    intent: "What are you in the mood for: food, culture, sport, beach, nature, drinks, or something else?",
    vibe: "What vibe or subcategory do you want?",
    timing: "When do you want to go: morning, afternoon, evening, or tonight?"
  }
};

function languageKey(language: string | undefined): "nl" | "fr" | "de" | "en" {
  if (language?.startsWith("nl")) return "nl";
  if (language?.startsWith("fr")) return "fr";
  if (language?.startsWith("de")) return "de";
  if (language?.startsWith("en")) return "en";
  return "fr";
}

export function buildClarifyingQuestion(field: MissingContextField, context: UserContext): string {
  const language = languageKey(context.language);
  if (field === "vibe") return buildVibeQuestion(language, context);

  return questions[language][field];
}

function buildVibeQuestion(language: "nl" | "fr" | "de" | "en", context: UserContext): string {
  const intent = context.intent;

  if (language === "nl") {
    if (intent === "sports") return "Welke sport-vibe zoek je: fitness, surf, yoga, running, lokaal of iets anders?";
    if (intent === "food") return "Welke food-vibe zoek je: lokaal, seafood, beach, rustig, levendig, romantisch of iets anders?";
    if (intent === "drink" || intent === "nightlife") return "Welke vibe zoek je: rustig, lokaal, levendig, romantisch, sunset of iets anders?";
    return "Welke vibe of subcategorie zoek je: lokaal, rustig, levendig, romantisch, beach of iets anders?";
  }

  if (language === "fr") {
    if (intent === "sports") return "Quelle vibe sport tu cherches : fitness, surf, yoga, running, local ou autre chose ?";
    if (intent === "food") return "Quelle vibe food tu cherches : local, seafood, beach, calme, animé, romantique ou autre chose ?";
    if (intent === "drink" || intent === "nightlife") return "Quelle ambiance tu cherches : calme, locale, animée, romantique, sunset ou autre chose ?";
    return "Quelle ambiance ou sous-catégorie tu cherches : local, calme, animé, romantique, beach ou autre chose ?";
  }

  if (language === "de") {
    if (intent === "sports") return "Welche Sport-Vibe suchst du: Fitness, Surfen, Yoga, Running, lokal oder etwas anderes?";
    if (intent === "food") return "Welche Food-Vibe suchst du: lokal, Seafood, Beach, ruhig, lebendig, romantisch oder etwas anderes?";
    if (intent === "drink" || intent === "nightlife") return "Welche Stimmung suchst du: ruhig, lokal, lebendig, romantisch, Sunset oder etwas anderes?";
    return "Welche Stimmung oder Unterkategorie suchst du: lokal, ruhig, lebendig, romantisch, Beach oder etwas anderes?";
  }

  if (intent === "sports") return "What sport vibe do you want: fitness, surfing, yoga, running, local or something else?";
  if (intent === "food") return "What food vibe do you want: local, seafood, beach, calm, lively, romantic or something else?";
  if (intent === "drink" || intent === "nightlife") return "What vibe do you want: calm, local, lively, romantic, sunset or something else?";
  return "What vibe or subcategory do you want: local, calm, lively, romantic, beach or something else?";
}
