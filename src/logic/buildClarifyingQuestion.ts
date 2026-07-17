import type { MissingContextField } from "./needsClarification.js";
import type { UserContext } from "../types/userContext.js";

const questions: Record<string, Record<MissingContextField, string>> = {
  nl: {
    location: "Waar ben je nu, of naar welke buurt/regio wil je gaan?",
    travellerType: "Voor wie zoek je iets: voor jezelf, voor jou en je partner, voor vrienden of voor familie?",
    children: "Zijn er kinderen bij, en zo ja welke leeftijden ongeveer?",
    intent: "Waar ben je vandaag naar op zoek? Bijvoorbeeld eten, cultuur, sport, strand, natuur, iets drinken of iets anders?",
    subcategory: "Wat zoek je daar precies binnen?",
    vibe: "Welke vibe of subcategorie zoek je?",
    timing: "Wanneer wil je gaan: ochtend, middag, avond of vanavond?"
  },
  fr: {
    location: "Tu es où maintenant, ou vers quel quartier/région tu veux aller ?",
    travellerType: "Pour qui cherches-tu quelque chose : pour toi, pour toi et ton/ta partenaire, pour des amis ou pour la famille ?",
    children: "Il y a des enfants avec toi, et si oui quel âge environ ?",
    intent: "Qu’est-ce que tu cherches aujourd’hui ? Par exemple manger, culture, sport, plage, nature, boire un verre ou autre chose ?",
    subcategory: "Qu’est-ce que tu cherches exactement dans cette catégorie ?",
    vibe: "Tu cherches quelle ambiance ou sous-catégorie ?",
    timing: "Tu veux y aller quand : matin, après-midi, soir ou ce soir ?"
  },
  de: {
    location: "Wo bist du gerade, oder in welches Viertel/welche Region möchtest du?",
    travellerType: "Für wen suchst du etwas: für dich, für dich und deinen Partner oder deine Partnerin, für Freunde oder für die Familie?",
    children: "Sind Kinder dabei, und wenn ja, ungefähr wie alt?",
    intent: "Was suchst du heute? Zum Beispiel Essen, Kultur, Sport, Strand, Natur, etwas trinken oder etwas anderes?",
    subcategory: "Was suchst du innerhalb dieser Kategorie genau?",
    vibe: "Welche Stimmung oder Unterkategorie suchst du?",
    timing: "Wann möchtest du gehen: morgens, nachmittags, abends oder heute Abend?"
  },
  en: {
    location: "Where are you now, or which neighbourhood or region do you want to go to?",
    travellerType: "Who should the suggestion be for: just you, you and your partner, friends, or family?",
    children: "Are there children with you, and roughly how old are they?",
    intent: "What are you looking for today? For example food, culture, sport, beach, nature, drinks, or something else?",
    subcategory: "What exactly are you looking for within that category?",
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
  if (field === "subcategory") return buildSubcategoryQuestion(language, context);
  if (field === "vibe") return buildVibeQuestion(language, context);

  return questions[language][field];
}

function buildSubcategoryQuestion(language: "nl" | "fr" | "de" | "en", context: UserContext): string {
  const intent = context.intent;

  const options = {
    nl: {
      food: "Wat wil je precies eten of drinken: lokaal eten, ontbijt, koffie, pizza, vegetarisch/vegan, dessert of iets anders?",
      drink: "Wat zoek je precies: koffie, cocktails, een bar, live muziek of iets anders?",
      culture: "Wat interesseert je het meest: kunst, muziek, architectuur, religieuze plekken, monumenten of iets anders?",
      beach: "Wat wil je aan het strand doen: relaxen, zwemmen, surfen, eten of iets anders?",
      sports: "Welke sport of activiteit wil je precies doen: fitness, surfen, yoga, lopen, zwemmen of iets anders?",
      nature: "Wat zoek je precies in de natuur: strand, wandelen, een mooi uitzicht, een excursie of iets anders?",
      nightlife: "Wat zoek je precies voor het uitgaan: een bar, cocktails, live muziek, karaoke, dansen of iets anders?",
      shopping: "Waar ben je precies naar op zoek of wat wil je kopen? Bijvoorbeeld vis, kunstwerken, handtassen, juwelen, houtwerk of iets anders?"
    },
    fr: {
      food: "Qu’est-ce que tu veux manger ou boire exactement : cuisine locale, petit-déjeuner, café, pizza, végétarien/végan, dessert ou autre chose ?",
      drink: "Qu’est-ce que tu cherches exactement : café, cocktails, un bar, de la musique live ou autre chose ?",
      culture: "Qu’est-ce qui t’intéresse le plus : l’art, la musique, l’architecture, les lieux religieux, les monuments ou autre chose ?",
      beach: "Qu’est-ce que tu veux faire à la plage : te détendre, nager, surfer, manger ou autre chose ?",
      sports: "Quel sport ou quelle activité veux-tu faire exactement : fitness, surf, yoga, course à pied, natation ou autre chose ?",
      nature: "Qu’est-ce que tu cherches exactement dans la nature : plage, promenade, beau paysage, excursion ou autre chose ?",
      nightlife: "Qu’est-ce que tu cherches exactement pour sortir : un bar, des cocktails, de la musique live, du karaoké, danser ou autre chose ?",
      shopping: "Qu’est-ce qui t’intéresse exactement ou qu’est-ce que tu veux acheter ? Par exemple du poisson, des œuvres d’art, des sacs à main, des bijoux, des objets en bois ou autre chose ?"
    },
    de: {
      food: "Was möchtest du genau essen oder trinken: lokale Küche, Frühstück, Kaffee, Pizza, vegetarisch/vegan, Dessert oder etwas anderes?",
      drink: "Was suchst du genau: Kaffee, Cocktails, eine Bar, Live-Musik oder etwas anderes?",
      culture: "Was interessiert dich am meisten: Kunst, Musik, Architektur, religiöse Orte, Denkmäler oder etwas anderes?",
      beach: "Was möchtest du am Strand machen: entspannen, schwimmen, surfen, essen oder etwas anderes?",
      sports: "Welche Sportart oder Aktivität möchtest du genau machen: Fitness, Surfen, Yoga, Laufen, Schwimmen oder etwas anderes?",
      nature: "Was suchst du genau in der Natur: Strand, Wandern, schöne Aussicht, Ausflug oder etwas anderes?",
      nightlife: "Was suchst du beim Ausgehen genau: eine Bar, Cocktails, Live-Musik, Karaoke, Tanzen oder etwas anderes?",
      shopping: "Was interessiert dich genau oder was möchtest du kaufen? Zum Beispiel Fisch, Kunstwerke, Handtaschen, Schmuck, Holzarbeiten oder etwas anderes?"
    },
    en: {
      food: "What exactly do you want to eat or drink: local food, breakfast, coffee, pizza, vegetarian/vegan, dessert, or something else?",
      drink: "What exactly are you looking for: coffee, cocktails, a bar, live music, or something else?",
      culture: "What interests you most: art, music, architecture, religious places, monuments, or something else?",
      beach: "What do you want to do at the beach: relax, swim, surf, eat, or something else?",
      sports: "Which sport or activity do you specifically want to do: fitness, surfing, yoga, running, swimming, or something else?",
      nature: "What exactly are you looking for in nature: beach, walking, a scenic view, an excursion, or something else?",
      nightlife: "What exactly are you looking for when going out: a bar, cocktails, live music, karaoke, dancing, or something else?",
      shopping: "What exactly are you interested in or looking to buy? For example fish, artworks, handbags, jewellery, woodwork, or something else?"
    }
  } as const;

  const key = intent && intent in options[language] ? intent as keyof typeof options[typeof language] : undefined;
  return key ? options[language][key] : questions[language].subcategory;
}

function buildVibeQuestion(language: "nl" | "fr" | "de" | "en", context: UserContext): string {
  const intent = context.intent;

  if (language === "nl") {
    if (intent === "culture") return "Wat interesseert je het meest: kunst, muziek, architectuur of monumenten?";
    if (intent === "shopping") return "Waar ben je precies naar op zoek of wat wil je kopen? Bijvoorbeeld vis, kunstwerken, handtassen, juwelen, houtwerk of iets anders?";
    if (intent === "food" && context.requestedSubcategory === "beach") return "Wat verkies je aan het strand: lokaal en betaalbaar, internationaal en wat chiquer, rustig en relaxed, of eerder levendig?";
    if (intent === "sports") return "Welke sport of activiteit wil je precies doen: fitness, surfen, yoga, lopen, zwemmen of iets anders?";
    if (intent === "food") return "Welke food-vibe zoek je: lokaal, pizza, seafood, beach, rustig, levendig, romantisch of iets anders?";
    if (intent === "drink" || intent === "nightlife") return "Welke vibe zoek je: rustig, lokaal, levendig, romantisch, sunset of iets anders?";
    return "Welke vibe of subcategorie zoek je: lokaal, rustig, levendig, romantisch, beach of iets anders?";
  }

  if (language === "fr") {
    if (intent === "culture") return "Qu’est-ce qui t’intéresse le plus : l’art, la musique, l’architecture ou les monuments ?";
    if (intent === "shopping") return "Qu’est-ce qui t’intéresse exactement ou qu’est-ce que tu veux acheter ? Par exemple du poisson, des œuvres d’art, des sacs à main, des bijoux, des objets en bois ou autre chose ?";
    if (intent === "food" && context.requestedSubcategory === "beach") return "Tu préfères quoi pour manger à la plage : local et abordable, international et plus chic, calme et relax, ou plutôt animé ?";
    if (intent === "sports") return "Quel sport ou quelle activité veux-tu faire exactement : fitness, surf, yoga, course à pied, natation ou autre chose ?";
    if (intent === "food") return "Quelle vibe food tu cherches : local, pizza, seafood, beach, calme, animé, romantique ou autre chose ?";
    if (intent === "drink" || intent === "nightlife") return "Quelle ambiance tu cherches : calme, locale, animée, romantique, sunset ou autre chose ?";
    return "Quelle ambiance ou sous-catégorie tu cherches : local, calme, animé, romantique, beach ou autre chose ?";
  }

  if (language === "de") {
    if (intent === "culture") return "Was interessiert dich am meisten: Kunst, Musik, Architektur oder Denkmäler?";
    if (intent === "shopping") return "Was interessiert dich genau oder was möchtest du kaufen? Zum Beispiel Fisch, Kunstwerke, Handtaschen, Schmuck, Holzarbeiten oder etwas anderes?";
    if (intent === "food" && context.requestedSubcategory === "beach") return "Was bevorzugst du beim Essen am Strand: lokal und günstig, international und etwas gehobener, ruhig und entspannt oder eher lebendig?";
    if (intent === "sports") return "Welche Sportart oder Aktivität möchtest du genau machen: Fitness, Surfen, Yoga, Laufen, Schwimmen oder etwas anderes?";
    if (intent === "food") return "Welche Food-Vibe suchst du: lokal, Pizza, Seafood, Beach, ruhig, lebendig, romantisch oder etwas anderes?";
    if (intent === "drink" || intent === "nightlife") return "Welche Stimmung suchst du: ruhig, lokal, lebendig, romantisch, Sunset oder etwas anderes?";
    return "Welche Stimmung oder Unterkategorie suchst du: lokal, ruhig, lebendig, romantisch, Beach oder etwas anderes?";
  }

  if (intent === "culture") return "What interests you most: art, music, architecture, or monuments?";
  if (intent === "shopping") return "What exactly are you interested in or looking to buy? For example fish, artworks, handbags, jewellery, woodwork, or something else?";
  if (intent === "food" && context.requestedSubcategory === "beach") return "What do you prefer for eating at the beach: local and affordable, international and more upscale, calm and relaxed, or lively?";
  if (intent === "sports") return "Which sport or activity do you specifically want to do: fitness, surfing, yoga, running, swimming, or something else?";
  if (intent === "food") return "What food vibe do you want: local, pizza, seafood, beach, calm, lively, romantic or something else?";
  if (intent === "drink" || intent === "nightlife") return "What vibe do you want: calm, local, lively, romantic, sunset or something else?";
  return "What vibe or subcategory do you want: local, calm, lively, romantic, beach or something else?";
}
