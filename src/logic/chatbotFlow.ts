import { buildUserContext } from "../ai/buildUserContext.js";
import { detectLanguage, detectRequestedLanguage } from "../ai/detectLanguage.js";
import { generateAnswer } from "../ai/generateAnswer.js";
import {
  deleteConversationContext,
  getConversationContext,
  upsertConversationContext
} from "../data/conversationContextRepository.js";
import { getLastOutgoingMessage, listRecentOutgoingMessages } from "../data/chatMessagesRepository.js";
import { listRecommendationPlaces } from "../data/placesRepository.js";
import {
  deleteRecommendationHistoryForUser,
  getLastRecommendedPlace,
  listRecommendedPlaceIds,
  recordPlaceRecommendation
} from "../data/recommendationHistoryRepository.js";
import { buildRetrievedFacts } from "../data/retrievalRepository.js";
import { findStoryKnowledgeMatch } from "../data/storiesRepository.js";
import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { buildClarifyingQuestion } from "./buildClarifyingQuestion.js";
import { buildGreetingResponse, isGreetingOnly } from "./greeting.js";
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
  if (context.language?.startsWith("nl")) {
    return "Ik heb geen nieuw adresje meer dat sterk genoeg past zonder mezelf te herhalen. Wil je dat ik breder zoek, bijvoorbeeld een andere buurt, andere vibe of iets anders dan dit?";
  }

  if (context.language?.startsWith("fr")) {
    return "Je n’ai plus de nouvelle adresse assez solide sans me répéter. Tu veux que j’élargisse la recherche, par exemple un autre quartier, une autre ambiance ou autre chose ?";
  }

  if (context.language?.startsWith("de")) {
    return "Ich habe keinen neuen starken Tipp mehr, ohne mich zu wiederholen. Soll ich breiter suchen, zum Beispiel anderes Viertel, andere Stimmung oder etwas anderes?";
  }

  return "I do not have a new strong match without repeating myself. Would you like me to search more broadly, for example another neighbourhood, another vibe or something different?";
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
  ].some((phrase) => normalized.includes(normalizeSearchText(phrase)));
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
    "restaurant",
    "dinner",
    "lunch",
    "bar",
    "beach",
    "culture",
    "market",
    "music",
    "dance",
    "hotel",
    "taxi",
    "transport",
    "voyage",
    "manger",
    "plage",
    "quartier",
    "reizen",
    "reis",
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

function buildRecommendationFeedbackReply(context: UserContext): string {
  if (context.language.startsWith("nl")) {
    return "Helemaal. Wil je nog iets anders?";
  }

  if (context.language.startsWith("fr")) {
    return "Parfait. Tu veux encore autre chose ?";
  }

  if (context.language.startsWith("de")) {
    return "Alles klar. Möchtest du noch etwas anderes?";
  }

  return "Got it. Would you like anything else?";
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

function placeArea(place: Place): string {
  return place.neighbourhood ?? place.region;
}

function buildAlternativeIntro(context: UserContext, place: Place): string {
  const requestedLocation = context.targetRegion ?? context.currentLocation;
  const alternativeLocation = placeArea(place);

  if (context.language?.startsWith("nl")) {
    return requestedLocation
      ? `Ik heb nog geen sterke OFFSCRIPT-match in ${requestedLocation}, maar wel een goede optie in ${alternativeLocation}: `
      : "";
  }

  if (context.language?.startsWith("fr")) {
    return requestedLocation
      ? `Je n’ai pas encore de match OFFSCRIPT vraiment solide à ${requestedLocation}, mais j’ai une bonne option à ${alternativeLocation} : `
      : "";
  }

  if (context.language?.startsWith("de")) {
    return requestedLocation
      ? `Ich habe noch keinen starken OFFSCRIPT-Match in ${requestedLocation}, aber eine gute Option in ${alternativeLocation}: `
      : "";
  }

  return requestedLocation
    ? `I do not have a strong OFFSCRIPT match in ${requestedLocation} yet, but I do have a good option in ${alternativeLocation}: `
    : "";
}

function buildGoogleMapsFollowUp(context: UserContext, place: Pick<Place, "name" | "googleMapsUrl">): string {
  if (context.language?.startsWith("nl")) {
    return `Exacte locatie van ${place.name}: ${place.googleMapsUrl}`;
  }

  if (context.language?.startsWith("fr")) {
    return `Localisation exacte de ${place.name} : ${place.googleMapsUrl}`;
  }

  if (context.language?.startsWith("de")) {
    return `Genauer Standort von ${place.name}: ${place.googleMapsUrl}`;
  }

  return `Exact location for ${place.name}: ${place.googleMapsUrl}`;
}

function buildAnythingElseFollowUp(context: UserContext): string {
  if (context.language?.startsWith("nl")) {
    return "Wil je nog iets anders?";
  }

  if (context.language?.startsWith("fr")) {
    return "Tu veux encore autre chose ?";
  }

  if (context.language?.startsWith("de")) {
    return "Möchtest du noch etwas anderes?";
  }

  return "Would you like anything else?";
}

function isResetCommand(message: string): boolean {
  return /^(?:reset|opnieuw beginnen|begin opnieuw|start opnieuw|restart|start over)[!,.?\s]*$/i.test(
    message.trim()
  );
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

  return Array.from(new Set(imageUrls)).slice(0, 2);
}

function wasPlaceAlreadyMentioned(place: Place, outgoingMessages: string[]): boolean {
  const placeName = normalizeSearchText(place.name);
  return outgoingMessages.some((message) => normalizeSearchText(message).includes(placeName));
}

export async function runChatbotFlow(userPhone: string, message: string): Promise<ChatbotFlowResult> {
  const previousContext = await getConversationContext(userPhone);

  if (isResetCommand(message)) {
    const context: UserContext = {
      language: detectLanguage(message, "en")
    };

    await deleteConversationContext(userPhone);
    await deleteRecommendationHistoryForUser(userPhone);
    await upsertConversationContext(userPhone, context);

    return {
      type: "clarification",
      context,
      message: buildGreetingResponse(context)
    };
  }

  if (isGreetingOnly(message)) {
    const context: UserContext = {
      ...previousContext,
      language: detectLanguage(message, previousContext?.language)
    };

    await upsertConversationContext(userPhone, context);

    return {
      type: "clarification",
      context,
      message: buildGreetingResponse(context)
    };
  }

  const requestedLanguage = detectRequestedLanguage(message);
  const storyLanguage = requestedLanguage ?? detectLanguage(message, previousContext?.language ?? "en");
  const knownRegion = findKnownRegion(message);
  const storyMatch = await findStoryKnowledgeMatch(message, storyLanguage);

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

  const { context } = await buildUserContext({
    message,
    previousContext
  });

  await upsertConversationContext(userPhone, context);

  const missingField = needsClarification(context);
  if (missingField) {
    const clarificationField = chooseClarificationFieldForMessage(message, context, missingField);
    const messageText =
      clarificationField === "travellerType"
        ? buildGreetingResponse(context)
        : buildClarifyingQuestion(clarificationField, context);

    return {
      type: "clarification",
      context,
      message: withEmojiAcknowledgement(message, context, messageText)
    };
  }

  const places = await listRecommendationPlaces();
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
      const retrievedFacts = await buildRetrievedFacts({
        context,
        alternativePlace: alternativeSelection.place
      });
      const messageText = await generateAnswer({
        userMessage: message,
        context,
        selectedPlace: alternativeSelection.place,
        retrievedFacts
      });

      return {
        type: "recommendation",
        context,
        placeId: alternativeSelection.place.id,
        placeName: alternativeSelection.place.name,
        googleMapsUrl: alternativeSelection.place.googleMapsUrl,
        score: alternativeSelection.score,
        message: `${buildAlternativeIntro(context, alternativeSelection.place)}${messageText}`,
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

  const retrievedFacts = await buildRetrievedFacts({
    context,
    selectedPlace: selection.place
  });
  const messageText = await generateAnswer({
    userMessage: message,
    context,
    selectedPlace: selection.place,
    retrievedFacts
  });

  return {
    type: "recommendation",
    context,
    placeId: selection.place.id,
    placeName: selection.place.name,
    googleMapsUrl: selection.place.googleMapsUrl,
    score: selection.score,
    message: messageText,
    imageUrls: selectRecommendationImages(selection.place, message)
  };
}

export async function handleChatMessage(input: {
  userPhone: string;
  message: string;
}): Promise<{ reply: string; followUpMessages: string[]; imageUrls: string[]; afterMediaMessages: string[] }> {
  const result = await runChatbotFlow(input.userPhone, input.message);
  const reply = await avoidRepeatedReply(input.userPhone, result);
  const followUpMessages =
    result.type === "recommendation" && reply === result.message
      ? [buildGoogleMapsFollowUp(result.context, { name: result.placeName, googleMapsUrl: result.googleMapsUrl })]
      : [];
  const afterMediaMessages =
    result.type === "recommendation" && reply === result.message ? [buildAnythingElseFollowUp(result.context)] : [];

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
    imageUrls: result.type === "recommendation" ? result.imageUrls : [],
    afterMediaMessages
  };
}
