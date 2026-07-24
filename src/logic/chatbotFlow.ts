import { buildUserContext } from "../ai/buildUserContext.js";
import { detectIntent } from "../ai/detectIntent.js";
import { detectLanguage, detectRequestedLanguage, resolveConversationLanguage } from "../ai/detectLanguage.js";
import { localizeRecommendationText } from "../ai/localizeRecommendationText.js";
import {
  deleteConversationContext,
  getConversationContext,
  upsertConversationContext
} from "../data/conversationContextRepository.js";
import { getLastOutgoingMessage, listRecentConversationMessages, listRecentOutgoingMessages } from "../data/chatMessagesRepository.js";
import { listPlaceContactDetails, type PlaceContactDetail } from "../data/contactsRepository.js";
import { listRecommendationPlaces } from "../data/placesRepository.js";
import {
  deleteRecommendationHistoryForUser,
  getLastRecommendedPlace,
  listRecommendedPlaceIds,
  recordPlaceRecommendation
} from "../data/recommendationHistoryRepository.js";
import { findStoryKnowledgeMatch } from "../data/storiesRepository.js";
import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { buildClarifyingQuestion } from "./buildClarifyingQuestion.js";
import {
  buildGreetingResponse,
  buildOffscriptWelcomeResponse,
  isGreetingOnly,
  isOffscriptStartMessage
} from "./greeting.js";
import { needsClarification, type MissingContextField } from "./needsClarification.js";
import { selectBestAlternativePlace, selectBestPlace } from "./selectBestPlace.js";
import { findKnownRegion, normalizeRegion } from "../utils/normalizeRegion.js";

export type ChatbotFlowResult =
  | {
      type: "clarification";
      context: UserContext;
      message: string;
    }
  | {
      type: "recommendation";
      context: UserContext;
      placeId: string;
      placeName: string;
      googleMapsUrl: string;
      shortDescription: string;
      offscriptReason?: string;
      personalTip?: string;
      practicalInfo?: string;
      socialUrl?: string;
      score: number;
      message: string;
      imageUrls: string[];
    }
  | {
      type: "no_match";
      context: UserContext;
      message: string;
    }
  | {
      type: "story";
      context: UserContext;
      storySlug: string;
      message: string;
    }
  | {
      type: "contact_info";
      context: UserContext;
      message: string;
    };

function buildNoMatchResponse(context: UserContext): string {
  const location = context.targetRegion ?? context.currentLocation;

  if (context.language?.startsWith("nl")) {
    if (location) {
      return `Ik heb nog geen sterke OFFSCRIPT-match in ${location}. Wil je naar een andere buurt in Dakar gaan? Dan kan ik breder zoeken.`;
    }

    return "Ik heb daar nog geen sterke OFFSCRIPT-match voor. Vertel me waar je bent en welke vibe je zoekt, dan probeer ik met wat ik wel al weet.";
  }

  if (context.language?.startsWith("fr")) {
    if (location) {
      return `Je n’ai pas encore de match OFFSCRIPT vraiment solide à ${location}. Est-ce que tu veux te déplacer dans un autre quartier de Dakar ? Je peux chercher plus largement.`;
    }

    return "Je n’ai pas encore de match OFFSCRIPT vraiment solide pour ça. Dis-moi où tu es et l’ambiance que tu cherches, et j’essaie avec ce que j’ai.";
  }

  if (context.language?.startsWith("de")) {
    if (location) {
      return `Ich habe noch keinen starken OFFSCRIPT-Match in ${location}. Wärst du offen für ein anderes Viertel in Dakar? Dann kann ich breiter suchen.`;
    }

    return "Ich habe dafür noch keinen starken OFFSCRIPT-Match. Sag mir, wo du bist und welche Stimmung du suchst, dann versuche ich es mit dem, was ich habe.";
  }

  if (location) {
    return `I do not have a strong OFFSCRIPT match in ${location} yet. Would you be open to another Dakar neighbourhood? I can search more broadly.`;
  }

  return "I do not have a strong OFFSCRIPT match for that yet. Tell me where you are and what kind of vibe you want, and I will try with what I do have.";
}

function buildNoNewMatchResponse(context: UserContext): string {
  const focus = context.vibe ?? (context.intent && context.intent !== "unknown" ? context.intent : "match");

  if (context.language?.startsWith("nl")) {
    return `Ik heb breder gekeken, maar ik heb nog geen tweede sterke ${focus}-plek zonder dezelfde plaats opnieuw te sturen. Ik kan wel zoeken naar een andere sport, een andere vibe of iets praktisch in de buurt.`;
  }

  if (context.language?.startsWith("fr")) {
    return `J’ai élargi la recherche, mais je n’ai pas encore une deuxième adresse ${focus} assez solide sans répéter le même lieu. Je peux chercher un autre sport, une autre ambiance ou quelque chose de pratique dans le coin.`;
  }

  if (context.language?.startsWith("de")) {
    return `Ich habe breiter gesucht, aber noch keinen zweiten starken ${focus}-Ort, ohne denselben Ort zu wiederholen. Ich kann nach einer anderen Sportart, einer anderen Stimmung oder etwas Praktischem in der Nähe suchen.`;
  }

  return `I searched more broadly, but I do not have a second strong ${focus} place yet without repeating the same spot. I can look for another sport, another vibe or something practical nearby.`;
}

function buildRecommendationAssumption(context: UserContext): string | undefined {
  if ((context.clarificationCount ?? 0) < 3) return undefined;

  const missingLocation = !normalizeRegion(context.targetRegion ?? context.currentLocation);
  const missingStyle = !context.requestedStyle && !context.budget && !context.vibe;
  if (!missingLocation && !missingStyle) return undefined;

  if (context.language.startsWith("nl")) {
    if (missingLocation) return "Ik ga ervan uit dat je je binnen Dakar kunt verplaatsen.";
    return "Ik kies de beste algemene match omdat je geen specifieke stijl of budget noemde.";
  }
  if (context.language.startsWith("fr")) {
    if (missingLocation) return "Je pars du principe que tu peux te déplacer dans Dakar.";
    return "Je choisis le meilleur choix général, car tu n’as pas indiqué de style ou de budget précis.";
  }
  if (context.language.startsWith("de")) {
    if (missingLocation) return "Ich gehe davon aus, dass du dich innerhalb Dakars bewegen kannst.";
    return "Ich wähle die beste allgemeine Option, da du keinen bestimmten Stil oder kein Budget genannt hast.";
  }
  if (missingLocation) return "I’m assuming you’re able to travel within Dakar.";
  return "I’m choosing the strongest general match because you didn’t specify a style or budget.";
}

function buildLanguagePreferenceResponse(context: UserContext): string {
  const missingField = needsClarification(context);

  const acknowledgement = context.language.startsWith("nl")
    ? "Helemaal, ik antwoord vanaf nu in het Nederlands."
    : context.language.startsWith("fr")
      ? "Bien sûr, je réponds en français à partir de maintenant."
      : context.language.startsWith("de")
        ? "Gerne, ich antworte ab jetzt auf Deutsch."
        : "Of course, I will answer in English from now on.";

  return missingField
    ? `${acknowledgement} ${buildClarifyingQuestion(missingField, context)}`
    : acknowledgement;
}

function containsObjectifyingSocialRequest(message: string): boolean {
  const normalized = normalizeSearchText(message);

  return [
    "my dick",
    "me and my dick",
    "hard dick",
    "dick",
    "my cock",
    "cock",
    "pussy",
    "sex",
    "hookup",
    "hook up",
    "get laid",
    "stijve",
    "mijn pik",
    "pik",
    "seks",
    "neuken",
    "beautiful girls",
    "hot girls",
    "pretty girls",
    "beautiful women",
    "hot women",
    "pretty women",
    "beautiful men",
    "hot men",
    "handsome men",
    "senegalese girls",
    "senegalese women",
    "senegalese men",
    "belles filles",
    "jolies filles",
    "filles chaudes",
    "belles femmes",
    "jolies femmes",
    "beaux hommes",
    "jolis hommes",
    "hommes beaux",
    "hommes sexy",
    "beaux senegalais",
    "mooie meisjes",
    "knappe meisjes",
    "mooie vrouwen",
    "knappe vrouwen",
    "mooie mannen",
    "knappe mannen",
    "mooie man",
    "knappe man",
    "knappe senegalese",
    "mooie senegalese",
    "senegalees ontmoeten",
    "senegalese ontmoeten"
  ].some((phrase) => containsNormalizedPhrase(normalized, phrase));
}

function buildRespectfulSocialResponse(context: UserContext): string {
  const location = context.targetRegion ?? context.currentLocation;

  if (context.language.startsWith("nl")) {
    return location
      ? `Ik kan je niet helpen zoeken naar mensen op basis van uiterlijk of seksuele interesse. Wel kan ik respectvolle sociale plekken in ${location} aanraden, zoals een bar, live music of een plek om te dansen. Wil je eerder iets rustig, lokaal of nightlife?`
      : "Ik kan je niet helpen zoeken naar mensen op basis van uiterlijk of seksuele interesse. Wel kan ik respectvolle sociale plekken aanraden, zoals een bar, live music of een plek om te dansen. In welke buurt ben je?";
  }

  if (context.language.startsWith("fr")) {
    return location
      ? `Je ne peux pas t’aider à chercher des personnes selon leur apparence ou avec une intention sexuelle. Par contre, je peux te recommander des lieux sociaux et respectueux à ${location}, comme un bar, de la musique live ou un endroit pour danser. Tu préfères une ambiance calme, locale ou plutôt nightlife ?`
      : "Je ne peux pas t’aider à chercher des personnes selon leur apparence ou avec une intention sexuelle. Par contre, je peux te recommander des lieux sociaux et respectueux, comme un bar, de la musique live ou un endroit pour danser. Tu es dans quel quartier ?";
  }

  if (context.language.startsWith("de")) {
    return location
      ? `Ich kann dir nicht dabei helfen, Menschen nach Aussehen oder mit sexueller Absicht zu suchen. Ich kann dir aber respektvolle soziale Orte in ${location} empfehlen, zum Beispiel eine Bar, Live-Musik oder einen Ort zum Tanzen. Suchst du eher ruhig, lokal oder Nightlife?`
      : "Ich kann dir nicht dabei helfen, Menschen nach Aussehen oder mit sexueller Absicht zu suchen. Ich kann dir aber respektvolle soziale Orte empfehlen, zum Beispiel eine Bar, Live-Musik oder einen Ort zum Tanzen. In welchem Viertel bist du?";
  }

  return location
    ? `I cannot help you look for people based on appearance or sexual interest. I can help with respectful social places in ${location}, like a bar, live music or somewhere to dance. Do you want something calm, local or more nightlife?`
    : "I cannot help you look for people based on appearance or sexual interest. I can help with respectful social places, like a bar, live music or somewhere to dance. Which neighbourhood are you in?";
}

function containsTravelSignal(message: string): boolean {
  const normalized = normalizeSearchText(message);

  return [
    "senegal",
    "dakar",
    "ngor",
    "yoff",
    "almadies",
    "mbour",
    "saly",
    "goree",
    "saint louis",
    "travel",
    "trip",
    "place",
    "places",
    "recommend",
    "recommendation",
    "restaurant",
    "dinner",
    "lunch",
    "bar",
    "beach",
    "culture",
    "art",
    "artwork",
    "artworks",
    "local art",
    "craft",
    "crafts",
    "gallery",
    "galerie",
    "atelier",
    "artist",
    "artists",
    "market",
    "music",
    "dance",
    "hotel",
    "taxi",
    "transport",
    "fitness",
    "gym",
    "sport",
    "sports",
    "workout",
    "training",
    "surf",
    "surfing",
    "surfen",
    "surfer",
    "voyage",
    "recommander",
    "manger",
    "art local",
    "artiste",
    "artistes",
    "artisanat",
    "artisanal",
    "plage",
    "quartier",
    "reizen",
    "reis",
    "kunst",
    "kunstenaars",
    "lokaal kunst",
    "plek",
    "plekken",
    "plaats",
    "plaatsen",
    "aanbevel",
    "aanraden",
    "eten",
    "strand",
    "buurt"
  ].some((phrase) => normalized.includes(normalizeSearchText(phrase)));
}

function containsContextAnswerSignal(message: string): boolean {
  const normalized = normalizeSearchText(message);

  return [
    "solo",
    "alone",
    "alleen",
    "seul",
    "couple",
    "koppel",
    "friends",
    "vrienden",
    "amis",
    "family",
    "familie",
    "famille",
    "tonight",
    "lunch",
    "tomorrow",
    "morgen",
    "demain",
    "noon",
    "midday",
    "vanavond",
    "ce soir",
    "morning",
    "ochtend",
    "matin",
    "afternoon",
    "middag",
    "apres midi",
    "evening",
    "avond",
    "soir"
  ].some((phrase) => normalized.includes(normalizeSearchText(phrase)));
}

function containsOffTopicSignal(message: string): boolean {
  const normalized = normalizeSearchText(message);

  return [
    "homework",
    "huiswerk",
    "devoir",
    "code",
    "coding",
    "javascript",
    "python",
    "printer",
    "wifi",
    "crypto",
    "bitcoin",
    "tax",
    "taxes",
    "belasting",
    "impot",
    "medical",
    "doctor",
    "legal",
    "lawyer",
    "contract",
    "recipe",
    "recept",
    "love advice",
    "relationship advice",
    "horoscope",
    "weather on mars",
    "pink elephant",
    "pink elephants",
    "roze olifant",
    "roze olifanten",
    "bevalling van",
    "zien bevallen",
    "zien bevalling",
    "leeuwin bevalling",
    "bevalling leeuwin",
    "leeuwin zien bevallen",
    "lioness birth",
    "birth of a lioness",
    "lion giving birth",
    "lioness giving birth",
    "see a lioness giving birth"
  ].some((phrase) => normalized.includes(normalizeSearchText(phrase)));
}

function isAbsurdOrOffTopicRequest(message: string): boolean {
  const trimmed = message.trim();
  const normalized = normalizeSearchText(trimmed);

  if (trimmed.length < 8) return false;
  if (detectIntent(trimmed)) return false;
  if (containsTravelSignal(trimmed) || containsContextAnswerSignal(trimmed)) return false;
  if (containsOffTopicSignal(trimmed)) return true;

  if (
    /\b(ik wil|ik zou graag|ik zou willen|i want|i would like|je veux|je voudrais|j aimerais|ich will|ich mochte|ich wurde gern)\b.+\b(zien|bevallen|see|voir|sehen)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  return /[?]/.test(trimmed) && /\b(can you|could you|do you|what is|why is|how do|kan je|kun je|wat is|waarom|waar kan|waar kan ik|comment|pourquoi)\b/i.test(trimmed);
}

function buildOffTopicResponse(context: UserContext): string {
  if (context.language.startsWith("nl")) {
    return "Daarvoor heb ik mijn slippers niet aangetrokken. Ik ben je OFFSCRIPT-hulp voor Senegal: plekken, buurten, cultuur, eten, bars, strand en praktische reistips. Waarmee kan ik je reis wél helpen?";
  }

  if (context.language.startsWith("fr")) {
    return "Là, je sors un peu de ma carte. Je suis ton aide OFFSCRIPT pour le Sénégal : lieux, quartiers, culture, food, bars, plage et conseils pratiques. Je t’aide avec quoi pour ton voyage ?";
  }

  if (context.language.startsWith("de")) {
    return "Dafür habe ich meine Reisesandalen nicht geschnürt. Ich bin deine OFFSCRIPT-Hilfe für Senegal: Orte, Viertel, Kultur, Essen, Bars, Strand und praktische Tipps. Wobei soll ich dir für die Reise helfen?";
  }

  return "That one is a little outside my travel lane. I am your OFFSCRIPT help for Senegal: places, neighbourhoods, culture, food, bars, beaches and practical tips. What can I help you discover?";
}

function isRecommendationFeedbackOnly(message: string): boolean {
  const normalized = normalizeSearchText(message).replace(/[^\p{L}\p{N}\s]/gu, "").trim();

  if (!normalized && /[\p{Emoji_Presentation}\uFE0F]/u.test(message)) return true;

  return /^(?:i know|i know thanks|got it|great|nice|perfect|cool|thanks|thank you|ok|okay|yes|yes thanks|super|top|merci|d accord|ok merci|oui|oui merci|ja|ja dank je|dank je|bedankt|prima|mooi|leuk)$/i.test(
    normalized
  );
}

function isContactInfoRequest(message: string): boolean {
  const normalized = normalizePhraseText(message);

  return [
    "phone",
    "phone number",
    "number",
    "telephone",
    "whatsapp",
    "contact",
    "call",
    "numero",
    "numero de telephone",
    "tel",
    "contacter",
    "appeler",
    "telefoonnummer",
    "nummer",
    "whatsapp nummer",
    "contactgegevens",
    "bellen"
  ].some((phrase) => containsNormalizedPhrase(normalized, phrase));
}

function preferredPhoneContact(details: PlaceContactDetail[]): PlaceContactDetail | undefined {
  return details.find((detail) => detail.type.toLowerCase() === "whatsapp") ??
    details.find((detail) => detail.type.toLowerCase() === "phone") ??
    details.find((detail) => ["tel", "telephone", "mobile"].includes(detail.type.toLowerCase()));
}

function buildContactInfoResponse(
  context: UserContext,
  placeName: string,
  details: PlaceContactDetail[]
): string {
  const contact = preferredPhoneContact(details);

  if (contact) {
    const contactName = contact.name && !normalizeSearchText(placeName).includes(normalizeSearchText(contact.name))
      ? ` (${contact.name})`
      : "";

    if (context.language.startsWith("nl")) return `Voor ${placeName}${contactName}: ${contact.value}`;
    if (context.language.startsWith("fr")) return `Pour ${placeName}${contactName} : ${contact.value}`;
    if (context.language.startsWith("de")) return `Für ${placeName}${contactName}: ${contact.value}`;
    return `For ${placeName}${contactName}: ${contact.value}`;
  }

  if (context.language.startsWith("nl")) return `Ik heb nog geen telefoonnummer voor ${placeName}.`;
  if (context.language.startsWith("fr")) return `Je n’ai pas encore de numéro de téléphone pour ${placeName}.`;
  if (context.language.startsWith("de")) return `Ich habe noch keine Telefonnummer für ${placeName}.`;
  return `I do not have a phone number for ${placeName} yet.`;
}

function buildRecommendationFeedbackReply(context: UserContext): string {
  if (context.language.startsWith("nl")) {
    return "Helemaal.";
  }

  if (context.language.startsWith("fr")) {
    return "Parfait.";
  }

  if (context.language.startsWith("de")) {
    return "Alles klar.";
  }

  return "Got it.";
}

async function isFeedbackAfterRecommendation(userPhone: string, message: string): Promise<boolean> {
  if (!isRecommendationFeedbackOnly(message)) return false;

  const [lastOutgoingMessage, lastRecommendedPlace] = await Promise.all([
    getLastOutgoingMessage(userPhone),
    getLastRecommendedPlace(userPhone)
  ]);

  return Boolean(
    lastOutgoingMessage &&
      lastRecommendedPlace &&
      normalizeSearchText(lastOutgoingMessage).includes(normalizeSearchText(lastRecommendedPlace.placeName))
  );
}

function hasAnyEmoji(message: string, emojis: string[]): boolean {
  return emojis.some((emoji) => message.includes(emoji));
}

function buildEmojiAcknowledgement(message: string, context: UserContext): string | undefined {
  if (hasAnyEmoji(message, ["❤️", "❤", "💕", "💖", "💘", "💞", "💓", "😍", "🥰", "😘"])) {
    if (context.language.startsWith("nl")) return "❤️ Romantische vibe.";
    if (context.language.startsWith("fr")) return "❤️ Ambiance romantique.";
    if (context.language.startsWith("de")) return "❤️ Romantische Stimmung.";
    return "❤️ Romantic vibe.";
  }

  if (hasAnyEmoji(message, ["🍽", "🍴", "🥘", "🍛", "🍜", "🍲", "🍤", "🍕", "🍔", "🌮", "🥗"])) {
    if (context.language.startsWith("nl")) return "🍽️ Zin in eten, duidelijk.";
    if (context.language.startsWith("fr")) return "🍽️ Envie de manger, je vois.";
    if (context.language.startsWith("de")) return "🍽️ Lust auf Essen, verstanden.";
    return "🍽️ Food mood, got it.";
  }

  if (hasAnyEmoji(message, ["🍷", "🍸", "🍹", "🍺", "🍻", "🥂", "☕"])) {
    if (context.language.startsWith("nl")) return "🍹 Iets drinken, helder.";
    if (context.language.startsWith("fr")) return "🍹 Un verre, c’est noté.";
    if (context.language.startsWith("de")) return "🍹 Etwas trinken, verstanden.";
    return "🍹 Drinks, got it.";
  }

  if (hasAnyEmoji(message, ["🏖", "🏖️", "⛱", "⛱️", "🏝", "🏝️", "🌊", "☀", "☀️"])) {
    if (context.language.startsWith("nl")) return "🏖️ Strandgevoel.";
    if (context.language.startsWith("fr")) return "🏖️ Ambiance plage.";
    if (context.language.startsWith("de")) return "🏖️ Strandstimmung.";
    return "🏖️ Beach mood.";
  }

  if (hasAnyEmoji(message, ["🎉", "🥳", "💃", "🕺", "🎶", "🎵", "🍾"])) {
    if (context.language.startsWith("nl")) return "🎉 Zin in sfeer.";
    if (context.language.startsWith("fr")) return "🎉 Envie d’ambiance.";
    if (context.language.startsWith("de")) return "🎉 Lust auf Stimmung.";
    return "🎉 Lively mood.";
  }

  if (hasAnyEmoji(message, ["🎨", "🖼", "🖼️", "🏛", "🏛️", "📚"])) {
    if (context.language.startsWith("nl")) return "🎨 Culturele toer.";
    if (context.language.startsWith("fr")) return "🎨 Plutôt culture.";
    if (context.language.startsWith("de")) return "🎨 Eher Kultur.";
    return "🎨 Culture mood.";
  }

  return undefined;
}

function withEmojiAcknowledgement(message: string, context: UserContext, response: string): string {
  const acknowledgement = buildEmojiAcknowledgement(message, context);

  if (!acknowledgement || response.startsWith(acknowledgement)) {
    return response;
  }

  return `${acknowledgement} ${response}`;
}

function hasSpecificContextLocation(context: UserContext): boolean {
  const location = normalizeRegion(context.currentLocation ?? context.targetRegion);
  if (!location) return false;
  if (location !== "Dakar") return true;
  return hasActionableMoodOrIntent(context);
}

function hasActionableMoodOrIntent(context: UserContext): boolean {
  return Boolean((context.intent && context.intent !== "unknown") || context.vibe);
}

function chooseClarificationFieldForMessage(
  message: string,
  context: UserContext,
  missingField: MissingContextField
): MissingContextField {
  if (
    missingField === "travellerType" &&
    (buildEmojiAcknowledgement(message, context) || hasActionableMoodOrIntent(context)) &&
    !hasSpecificContextLocation(context)
  ) {
    return "location";
  }

  return missingField;
}

function normalizeReplyForComparison(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, " ").trim();
}

function isGreetingClarification(message: string): boolean {
  const normalized = normalizeReplyForComparison(message);

  return (
    normalized.startsWith("na nga def") &&
    (normalized.includes("met wie reis") ||
      normalized.includes("who are you travelling") ||
      normalized.includes("tu voyages") ||
      normalized.includes("reist du"))
  );
}

function isOffTopicRedirect(message: string): boolean {
  const normalized = normalizeReplyForComparison(message);

  return (
    normalized.includes("offscript-hulp voor senegal") ||
    normalized.includes("aide offscript pour le senegal") ||
    normalized.includes("offscript-hilfe fur senegal") ||
    normalized.includes("offscript help for senegal")
  );
}

function isNoNewMatchResponse(message: string): boolean {
  const normalized = normalizeReplyForComparison(message);

  return (
    normalized.includes("geen tweede sterke") ||
    normalized.includes("deuxieme adresse") ||
    normalized.includes("zweiten starken") ||
    normalized.includes("second strong")
  );
}

function buildRepeatedNoNewMatchResponse(context: UserContext): string {
  const focus = context.vibe ?? (context.intent && context.intent !== "unknown" ? context.intent : "match");

  if (context.language.startsWith("nl")) {
    return `Ik heb echt geen tweede sterke ${focus}-plek klaarstaan zonder dezelfde plek te herhalen. Kies gerust een andere sport, vibe of buurt.`;
  }

  if (context.language.startsWith("fr")) {
    return `Je n’ai vraiment pas une deuxième adresse ${focus} solide sans répéter le même lieu. Choisis plutôt un autre sport, une autre ambiance ou un autre quartier.`;
  }

  if (context.language.startsWith("de")) {
    return `Ich habe wirklich keinen zweiten starken ${focus}-Ort, ohne denselben Tipp zu wiederholen. Wähle gern eine andere Sportart, Stimmung oder ein anderes Viertel.`;
  }

  return `I really do not have a second strong ${focus} place without repeating the same spot. Try another sport, vibe or neighbourhood.`;
}

function buildRepeatedOffTopicRedirect(context: UserContext): string {
  if (context.language.startsWith("nl")) {
    return "Ik blijf even op mijn Senegal-kaart. Geef me een buurt, timing of vibe, dan help ik je met iets dat wél OFFSCRIPT is.";
  }

  if (context.language.startsWith("fr")) {
    return "Je reste sur ma carte du Sénégal. Donne-moi un quartier, un moment ou une ambiance, et je t’aide avec quelque chose de vraiment OFFSCRIPT.";
  }

  if (context.language.startsWith("de")) {
    return "Ich bleibe kurz auf meiner Senegal-Karte. Gib mir Viertel, Zeitpunkt oder Stimmung, dann helfe ich dir mit etwas, das wirklich zu OFFSCRIPT passt.";
  }

  return "I am staying on my Senegal map for this one. Give me a neighbourhood, timing or vibe, and I will help with something properly OFFSCRIPT.";
}

function buildRepeatedReply(result: ChatbotFlowResult): string {
  if (isGreetingClarification(result.message)) {
    return result.message;
  }

  if (isOffTopicRedirect(result.message)) {
    return buildRepeatedOffTopicRedirect(result.context);
  }

  if (isNoNewMatchResponse(result.message)) {
    return buildRepeatedNoNewMatchResponse(result.context);
  }

  const { context } = result;

  if (context.language.startsWith("nl")) {
    return "Geef me één concreet reis-haakje: je buurt, wanneer je wil gaan of de sfeer die je zoekt. Dan denk ik gerichter mee.";
  }

  if (context.language.startsWith("fr")) {
    return "Je ne vais pas me copier-coller. Donne-moi juste un repère concret : ton quartier, le moment ou l’ambiance que tu cherches. Là je peux mieux t’aider.";
  }

  if (context.language.startsWith("de")) {
    return "Ich wiederhole mich lieber nicht eins zu eins. Gib mir einen konkreten Reise-Hinweis: Viertel, Zeitpunkt oder gewünschte Stimmung. Dann helfe ich gezielter.";
  }

  return "I will not copy-paste myself. Give me one concrete travel clue: your neighbourhood, timing or the kind of vibe you want. Then I can help properly.";
}

async function avoidRepeatedReply(userPhone: string, result: ChatbotFlowResult): Promise<string> {
  if (result.type === "story" || result.type === "recommendation") {
    return result.message;
  }

  const lastOutgoingMessage = await getLastOutgoingMessage(userPhone);

  if (!lastOutgoingMessage) {
    return result.message;
  }

  const previous = normalizeReplyForComparison(lastOutgoingMessage);
  const next = normalizeReplyForComparison(result.message);

  return previous === next ? buildRepeatedReply(result) : result.message;
}

function isResetCommand(message: string): boolean {
  return /^(?:reset|opnieuw beginnen|begin opnieuw|start opnieuw|restart|start over)[!,.?\s]*$/i.test(
    message.trim()
  );
}

function preferredSocialUrl(place: Place): string | undefined {
  return place.instagramUrl ?? place.tiktokUrl ?? place.facebookUrl;
}

function placeAreaLabel(place: Place): string | undefined {
  return place.area ?? place.neighbourhood ?? place.region;
}

function recommendationTitle(place: Place): string {
  const area = placeAreaLabel(place);
  return area ? `${place.name} - ${area}` : place.name;
}

const SUBCATEGORY_ALIASES: Record<string, string[]> = {
  jewellery: ["jewellery", "jewelry", "juwelen", "juweel", "sieraden", "bijoux"],
  wood: ["wood", "woodwork", "hout", "houten", "bois"],
  artworks: ["artworks", "art", "kunst", "kunstwerken", "artwork", "oeuvres", "œuvres"],
  handbags: ["handbags", "bags", "bag", "handtassen", "handtas", "tassen", "sacs", "sac"]
};

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizePhraseText(value: string): string {
  return normalizeSearchText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsNormalizedPhrase(normalizedMessage: string, phrase: string): boolean {
  const searchableMessage = ` ${normalizePhraseText(normalizedMessage)} `;
  const searchablePhrase = normalizePhraseText(phrase);

  return Boolean(searchablePhrase && searchableMessage.includes(` ${searchablePhrase} `));
}

function subcategoryMatchesMessage(subcategoryName: string, message: string): boolean {
  const normalizedMessage = normalizeSearchText(message);
  const normalizedName = normalizeSearchText(subcategoryName);
  const aliases = SUBCATEGORY_ALIASES[normalizedName] ?? [normalizedName];

  return aliases.some((alias) => normalizedMessage.includes(normalizeSearchText(alias)));
}

function selectRecommendationImages(place: Place, message: string): string[] {
  const matchingSubcategoryImages = place.subcategories
    .filter((subcategory) => subcategoryMatchesMessage(subcategory.name, message))
    .flatMap((subcategory) => subcategory.images.map((image) => image.url));

  const imageUrls = [
    ...matchingSubcategoryImages,
    ...place.images.map((image) => image.url),
    ...place.subcategories.flatMap((subcategory) => subcategory.images.map((image) => image.url))
  ];

  return Array.from(new Set(imageUrls)).slice(0, 3);
}

function wasPlaceAlreadyMentioned(place: Place, outgoingMessages: string[]): boolean {
  const placeName = normalizeSearchText(place.name);
  return outgoingMessages.some((message) => normalizeSearchText(message).includes(placeName));
}

export async function runChatbotFlow(userPhone: string, message: string): Promise<ChatbotFlowResult> {
  const previousContext = await getConversationContext(userPhone);
  const previousAssistantMessage = await getLastOutgoingMessage(userPhone);
  const useWolofGreeting = !previousAssistantMessage;

  if (isOffscriptStartMessage(message)) {
    const context: UserContext = { language: "fr", clarificationCount: 0 };

    await deleteConversationContext(userPhone);
    await deleteRecommendationHistoryForUser(userPhone);
    await upsertConversationContext(userPhone, context);

    return {
      type: "clarification",
      context,
      message: buildOffscriptWelcomeResponse()
    };
  }

  if (isResetCommand(message)) {
    const context: UserContext = { language: "fr", clarificationCount: 0 };

    await deleteConversationContext(userPhone);
    await deleteRecommendationHistoryForUser(userPhone);
    await upsertConversationContext(userPhone, context);

    return {
      type: "clarification",
      context,
      message: buildOffscriptWelcomeResponse()
    };
  }

  if (isGreetingOnly(message)) {
    const context: UserContext = {
      ...previousContext,
      language: resolveConversationLanguage(message, previousContext?.language)
    };

    await upsertConversationContext(userPhone, context);

    return {
      type: "clarification",
      context,
      message: buildGreetingResponse(context, { useWolofGreeting })
    };
  }

  const requestedLanguage = detectRequestedLanguage(message);
  const storyLanguage = resolveConversationLanguage(message, previousContext?.language, "fr");
  const knownRegion = findKnownRegion(message);
  const storyMatch = await findStoryKnowledgeMatch(message, storyLanguage);

  if (isContactInfoRequest(message)) {
    const lastRecommendedPlace = await getLastRecommendedPlace(userPhone);

    if (lastRecommendedPlace?.placeId) {
      const context: UserContext = {
        ...previousContext,
        language: storyLanguage
      };
      const details = await listPlaceContactDetails(lastRecommendedPlace.placeId);

      await upsertConversationContext(userPhone, context);

      return {
        type: "contact_info",
        context,
        message: buildContactInfoResponse(context, lastRecommendedPlace.placeName, details)
      };
    }
  }

  if (await isFeedbackAfterRecommendation(userPhone, message)) {
    const context: UserContext = {
      ...previousContext,
      language: storyLanguage
    };

    await upsertConversationContext(userPhone, context);

    return {
      type: "clarification",
      context,
      message: buildRecommendationFeedbackReply(context)
    };
  }

  if (storyMatch) {
    const context: UserContext = {
      ...previousContext,
      language: storyLanguage
    };

    await upsertConversationContext(userPhone, context);

    return {
      type: "story",
      context,
      storySlug: storyMatch.slug,
      message: `${storyMatch.shortWhatsappReply}\n\n👉 ${storyMatch.url}`
    };
  }

  if (requestedLanguage) {
    const context: UserContext = {
      ...previousContext,
      language: requestedLanguage
    };

    await upsertConversationContext(userPhone, context);

    return {
      type: "clarification",
      context,
      message: buildLanguagePreferenceResponse(context)
    };
  }

  if (containsObjectifyingSocialRequest(message)) {
    const context: UserContext = {
      ...previousContext,
      language: storyLanguage,
      targetRegion: normalizeRegion(knownRegion ?? previousContext?.targetRegion),
      intent: "nightlife"
    };

    await upsertConversationContext(userPhone, context);

    return {
      type: "clarification",
      context,
      message: buildRespectfulSocialResponse(context)
    };
  }

  if (isAbsurdOrOffTopicRequest(message)) {
    const context: UserContext = {
      ...previousContext,
      language: storyLanguage
    };

    await upsertConversationContext(userPhone, context);

    return {
      type: "clarification",
      context,
      message: buildOffTopicResponse(context)
    };
  }

  const conversationHistory = await listRecentConversationMessages(userPhone, 8);
  const { context } = await buildUserContext({
    message,
    previousContext,
    previousAssistantMessage,
    conversationHistory
  });

  const missingField = needsClarification(context);
  if (missingField) {
    const clarificationField = chooseClarificationFieldForMessage(message, context, missingField);
    const contextAfterQuestion: UserContext = {
      ...context,
      clarificationCount: (context.clarificationCount ?? 0) + 1
    };
    const messageText =
      clarificationField === "travellerType"
        ? buildGreetingResponse(contextAfterQuestion, { useWolofGreeting })
        : buildClarifyingQuestion(clarificationField, contextAfterQuestion);

    await upsertConversationContext(userPhone, contextAfterQuestion);

    return {
      type: "clarification",
      context: contextAfterQuestion,
      message: withEmojiAcknowledgement(message, contextAfterQuestion, messageText)
    };
  }

  await upsertConversationContext(userPhone, context);

  const places = await listRecommendationPlaces(context.language);
  const [recommendedPlaceIds, recentOutgoingMessages] = await Promise.all([
    listRecommendedPlaceIds(userPhone),
    listRecentOutgoingMessages(userPhone)
  ]);
  const recommendedPlaceIdSet = new Set(recommendedPlaceIds);
  const newPlaces = places.filter(
    (place) => !recommendedPlaceIdSet.has(place.id) && !wasPlaceAlreadyMentioned(place, recentOutgoingMessages)
  );
  const selection = selectBestPlace(newPlaces, context);

  if (!selection) {
    const alternativeSelection = selectBestAlternativePlace(newPlaces, context);

    if (alternativeSelection) {
      return {
        type: "recommendation",
        context,
        placeId: alternativeSelection.place.id,
        placeName: alternativeSelection.place.name,
        googleMapsUrl: alternativeSelection.place.googleMapsUrl,
        shortDescription: alternativeSelection.place.shortDescription,
        offscriptReason: alternativeSelection.place.offscriptReason,
        personalTip: alternativeSelection.place.personalTip,
        practicalInfo: alternativeSelection.place.practicalInfo,
        socialUrl: preferredSocialUrl(alternativeSelection.place),
        score: alternativeSelection.score,
        message: recommendationTitle(alternativeSelection.place),
        imageUrls: selectRecommendationImages(alternativeSelection.place, message)
      };
    }

    if (newPlaces.length < places.length && selectBestPlace(places, context)) {
      return {
        type: "no_match",
        context,
        message: buildNoNewMatchResponse(context)
      };
    }

    return {
      type: "no_match",
      context,
      message: buildNoMatchResponse(context)
    };
  }

  return {
    type: "recommendation",
    context,
    placeId: selection.place.id,
    placeName: selection.place.name,
    googleMapsUrl: selection.place.googleMapsUrl,
    shortDescription: selection.place.shortDescription,
    offscriptReason: selection.place.offscriptReason,
    personalTip: selection.place.personalTip,
    practicalInfo: selection.place.practicalInfo,
    socialUrl: preferredSocialUrl(selection.place),
    score: selection.score,
    message: recommendationTitle(selection.place),
    imageUrls: selectRecommendationImages(selection.place, message)
  };
}

export async function handleChatMessage(input: {
  userPhone: string;
  message: string;
}): Promise<{
  reply: string;
  followUpMessages: string[];
  locationActions: string[];
  imageUrls: string[];
  afterMediaMessages: string[];
}> {
  const result = await runChatbotFlow(input.userPhone, input.message);
  const startsNewConversation =
    isResetCommand(input.message) || isOffscriptStartMessage(input.message);
  const reply = startsNewConversation
    ? result.message
    : await avoidRepeatedReply(input.userPhone, result);
  const locationActions: string[] = [];
  const localizedRecommendation =
    result.type === "recommendation" && reply === result.message
      ? await localizeRecommendationText({
          language: result.context.language,
          shortDescription: result.shortDescription,
          offscriptReason: result.offscriptReason,
          personalTip: result.personalTip,
          practicalInfo: result.practicalInfo
        })
      : null;
  const followUpMessages =
    result.type === "recommendation" && localizedRecommendation
      ? [
          localizedRecommendation.shortDescription,
          localizedRecommendation.personalTip,
          localizedRecommendation.practicalInfo,
          buildRecommendationAssumption(result.context),
          result.socialUrl,
          result.googleMapsUrl
        ].filter(
          (message): message is string => Boolean(message)
        )
      : [];
  const afterMediaMessages: string[] = [];

  if (result.type === "recommendation") {
    await recordPlaceRecommendation({
      userPhone: input.userPhone,
      placeId: result.placeId,
      placeName: result.placeName
    });
  }

  return {
    reply,
    followUpMessages,
    locationActions,
    imageUrls: result.type === "recommendation" ? result.imageUrls : [],
    afterMediaMessages
  };
}
