import {
  buildUserContext,
  acceptsBroaderLocation,
  inferRequestedStyle,
  isLocalSenegaleseDishRequest
} from "../ai/buildUserContext.js";
import { detectLanguage, detectRequestedLanguage, resolveConversationLanguage } from "../ai/detectLanguage.js";
import {
  findCurrentEvent,
  isCurrentEventRequest,
  type CuratedEventVenue
} from "../ai/findCurrentEvent.js";
import { generatePlaceFollowUpReply } from "../ai/generatePlaceFollowUpReply.js";
import { generateClarifyingQuestion } from "../ai/generateClarifyingQuestion.js";
import { localizeRecommendationText } from "../ai/localizeRecommendationText.js";
import {
  deleteConversationContext,
  getConversationContext,
  upsertConversationContext
} from "../data/conversationContextRepository.js";
import { getLastOutgoingMessage, listRecentConversationMessages } from "../data/chatMessagesRepository.js";
import { listPlaceContactDetails, type PlaceContactDetail } from "../data/contactsRepository.js";
import { listRecommendationPlaces } from "../data/placesRepository.js";
import { getWhatsAppUser } from "../data/whatsappUsersRepository.js";
import {
  deleteRecommendationHistoryForUser,
  getLastRecommendedPlace,
  listRecommendedPlaceIds,
  recordPlaceRecommendation
} from "../data/recommendationHistoryRepository.js";
import { findStoryKnowledgeMatch } from "../data/storiesRepository.js";
import type { Place } from "../types/place.js";
import type { UserContext } from "../types/userContext.js";
import { buildClarifyingQuestion, buildLocalDishLocationQuestion } from "./buildClarifyingQuestion.js";
import {
  buildGreetingResponse,
  buildOffscriptWelcomeResponse,
  isOffscriptStartMessage
} from "./greeting.js";
import { needsClarification, type MissingContextField } from "./needsClarification.js";
import {
  findClarificationCandidates,
  selectBestAlternativePlace,
  selectBestPlace
} from "./selectBestPlace.js";
import { isPlaceInformationFollowUp } from "./placeFollowUp.js";
import { acceptsAnyLocation } from "./locationReply.js";
import { buildSubcategoryTaxonomy } from "./subcategoryTaxonomy.js";
import { findKnownRegion, normalizeRegion } from "../utils/normalizeRegion.js";
import {
  buildFrustrationRecovery,
  contextForNewSearch,
  findExplicitPlaceRequest,
  isFrustratedReply,
  startsNewSearch
} from "./searchSession.js";

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
      priceLevel?: Place["priceLevel"];
      offscriptPickLevel: Place["offscriptPickLevel"];
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
  const hasSpecificLocation = Boolean(location && normalizeRegion(location) !== "Dakar");
  const focus = context.requestedSubcategory;
  const recommendationType = context.searchProfile?.recommendationType;

  if (focus && recommendationType && recommendationType !== "place") {
    const labels: Record<string, Record<string, string>> = {
      running: { nl: "hardlopen", fr: "courir", de: "Laufen", en: "running" },
      walking: { nl: "wandelen", fr: "une promenade", de: "Spazierengehen", en: "walking" },
      cycling: { nl: "fietsen", fr: "faire du vélo", de: "Radfahren", en: "cycling" },
      "photography walk": { nl: "een fotowandeling", fr: "une balade photo", de: "einen Fotospaziergang", en: "a photography walk" },
      swimming: { nl: "zwemmen", fr: "nager", de: "Schwimmen", en: "swimming" },
      surfing: { nl: "surfen", fr: "surfer", de: "Surfen", en: "surfing" }
    };
    const language = context.language?.slice(0, 2) ?? "en";
    const localizedFocus = labels[focus]?.[language] ?? focus;
    const isRoute = recommendationType === "route";

    if (context.language?.startsWith("nl")) {
      return hasSpecificLocation
        ? `Ik begrijp dat je wilt ${localizedFocus}. Ik heb daarvoor nog geen sterke ${isRoute ? "route" : "activiteit"} in ${location} in mijn huidige data. Wil je dat ik ook in een andere buurt kijk?`
        : `Ik begrijp dat je wilt ${localizedFocus}, maar ik heb daarvoor nog geen sterke ${isRoute ? "route" : "activiteit"} in mijn huidige data.`;
    }
    if (context.language?.startsWith("fr")) {
      return hasSpecificLocation
        ? `J’ai bien compris que tu veux ${localizedFocus}. Je n’ai pas encore ${isRoute ? "d’itinéraire" : "d’activité"} suffisamment documenté à ${location}. Tu veux que je regarde aussi dans un autre quartier ?`
        : `J’ai bien compris que tu veux ${localizedFocus}, mais je n’ai pas encore ${isRoute ? "d’itinéraire" : "d’activité"} suffisamment documenté dans mes données.`;
    }
    if (context.language?.startsWith("de")) {
      return hasSpecificLocation
        ? `Ich habe verstanden, dass du ${localizedFocus} möchtest. Für ${location} habe ich derzeit noch ${isRoute ? "keine passende Route" : "keine passende Aktivität"} in meinen Daten. Soll ich auch in einem anderen Viertel suchen?`
        : `Ich habe verstanden, dass du ${localizedFocus} möchtest, habe dafür aber noch ${isRoute ? "keine passende Route" : "keine passende Aktivität"} in meinen Daten.`;
    }
    return hasSpecificLocation
      ? `I understand that you want to go ${localizedFocus}. I do not yet have a strong ${isRoute ? "route" : "activity"} for ${location} in my current data. Would you like me to check another neighbourhood too?`
      : `I understand that you want to go ${localizedFocus}, but I do not yet have a strong ${isRoute ? "route" : "activity"} in my current data.`;
  }

  if (context.language?.startsWith("nl")) {
    if (hasSpecificLocation) {
      return `Ik heb nog geen sterke TUUTI-pick in ${location}. Wil je naar een andere buurt in Dakar gaan? Dan kan ik breder zoeken.`;
    }

    return "Ik heb daar nog geen sterke TUUTI-pick voor in mijn huidige data.";
  }

  if (context.language?.startsWith("fr")) {
    if (hasSpecificLocation) {
      return `Je n’ai pas encore de TUUTI-pick vraiment solide à ${location}. Est-ce que tu veux te déplacer dans un autre quartier de Dakar ? Je peux chercher plus largement.`;
    }

    return "Je n’ai pas encore de TUUTI-pick vraiment solide pour ça dans mes données actuelles.";
  }

  if (context.language?.startsWith("de")) {
    if (hasSpecificLocation) {
      return `Ich habe noch keinen starken TUUTI-Pick in ${location}. Wärst du offen für ein anderes Viertel in Dakar? Dann kann ich breiter suchen.`;
    }

    return "Ich habe dafür in meinen aktuellen Daten noch keinen starken TUUTI-Pick.";
  }

  if (hasSpecificLocation) {
    return `I do not have a strong TUUTI pick in ${location} yet. Would you be open to another Dakar neighbourhood? I can search more broadly.`;
  }

  return "I do not have a strong TUUTI pick for that in my current data yet.";
}

function recommendationFocusLabel(context: UserContext): string | undefined {
  const focus = context.requestedSubcategory ?? context.searchProfile?.products[0];
  if (!focus) return undefined;

  const normalized = focus.toLowerCase().replaceAll("_", " ");
  const labels: Record<string, Record<string, string>> = {
    nl: { japanese_food: "sushi", "japanese food": "sushi", coffee: "koffie", cocktails: "cocktails" },
    fr: { japanese_food: "sushi", "japanese food": "sushi", coffee: "café", cocktails: "cocktails" },
    de: { japanese_food: "Sushi", "japanese food": "Sushi", coffee: "Kaffee", cocktails: "Cocktails" },
    en: { japanese_food: "sushi", "japanese food": "sushi", coffee: "coffee", cocktails: "cocktails" }
  };
  const language = context.language?.startsWith("nl")
    ? "nl"
    : context.language?.startsWith("fr")
      ? "fr"
      : context.language?.startsWith("de")
        ? "de"
        : "en";
  return labels[language][focus.toLowerCase()] ?? labels[language][normalized] ?? normalized;
}

function buildNoNewMatchResponse(context: UserContext, previousPlaceName?: string): string {
  const focus = recommendationFocusLabel(context);
  const placeReference = previousPlaceName ? `: ${previousPlaceName}` : "";
  if (context.language?.startsWith("nl")) {
    return focus
      ? `Voor ${focus} heb ik momenteel maar één sterke TUUTI-pick in mijn data${placeReference}. Ik heb dus geen goede tweede optie zonder dezelfde plek opnieuw te noemen.`
      : "Ik heb momenteel geen tweede sterke optie in mijn data zonder dezelfde plek opnieuw te noemen.";
  }

  if (context.language?.startsWith("fr")) {
    return focus
      ? `Pour ${focus}, je n’ai actuellement qu’une seule adresse TUUTI vraiment solide dans mes données${placeReference}. Je n’ai donc pas de bonne deuxième option sans répéter la même adresse.`
      : "Je n’ai actuellement pas de deuxième option vraiment solide dans mes données sans répéter la même adresse.";
  }

  if (context.language?.startsWith("de")) {
    return focus
      ? `Für ${focus} habe ich derzeit nur einen wirklich starken TUUTI-Tipp in meinen Daten${placeReference}. Daher habe ich keine gute zweite Option, ohne denselben Ort zu wiederholen.`
      : "Ich habe derzeit keine zweite wirklich starke Option in meinen Daten, ohne denselben Ort zu wiederholen.";
  }

  return focus
    ? `For ${focus}, I currently have only one strong TUUTI pick in my data${placeReference}. I therefore do not have a good second option without repeating the same place.`
    : "I currently have no second strong option in my data without repeating the same place.";
}

function buildAlternativeLocationQuestion(language: string, neighbourhood: string): string {
  if (language.startsWith("nl")) {
    return `Wil je in ${neighbourhood} blijven, of wil je ook een andere buurt ontdekken?`;
  }
  if (language.startsWith("fr")) {
    return `Tu préfères rester à ${neighbourhood}, ou découvrir aussi un autre quartier ?`;
  }
  if (language.startsWith("de")) {
    return `Möchtest du in ${neighbourhood} bleiben oder auch ein anderes Viertel entdecken?`;
  }
  return `Would you like to stay in ${neighbourhood}, or explore another neighbourhood too?`;
}

function isRegionOnlyReply(message: string, region: string | undefined): boolean {
  if (!region) return false;
  const normalize = (value: string) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const answer = normalize(message).replace(/^(?:in|at|dans|a|à)\s+/, "");
  return answer === normalize(region);
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

function mentionsWhatsApp(messages: Array<string | undefined>): boolean {
  return messages.some((message) => /\bwhats\s*app\b/i.test(message ?? ""));
}

function buildWhatsAppContactLine(
  context: UserContext,
  details: PlaceContactDetail[]
): string | undefined {
  const contact = preferredPhoneContact(details);
  if (!contact) return undefined;

  if (context.language?.startsWith("fr")) return `WhatsApp : ${contact.value}`;
  return `WhatsApp: ${contact.value}`;
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

function lowerFirst(value: string): string {
  return value ? `${value[0]?.toLowerCase()}${value.slice(1)}` : value;
}

function buildProgressClarification(
  context: UserContext,
  places: Place[],
  question: string
): string {
  if ((context.clarificationCount ?? 0) < 1) return question;

  const candidates = findClarificationCandidates(places, context);
  if (candidates.length < 2) return question;

  const location = normalizeRegion(context.targetRegion ?? context.currentLocation);
  const locationText = location && location !== "Dakar" ? `, ${location}` : "";
  const nextQuestion = lowerFirst(question);

  if (context.language.startsWith("nl")) {
    const options = candidates.length === 2 ? "twee plekken" : "een paar plekken";
    return `Oké${locationText} — ik heb al ${options} in gedachten. Nog één ding: ${nextQuestion}`;
  }
  if (context.language.startsWith("fr")) {
    const options = candidates.length === 2 ? "deux adresses" : "quelques adresses";
    return `D’accord${locationText} — j’ai déjà ${options} en tête. Encore une chose : ${nextQuestion}`;
  }
  if (context.language.startsWith("de")) {
    const options = candidates.length === 2 ? "zwei Orte" : "ein paar Orte";
    return `Alles klar${locationText} — ich habe schon ${options} im Kopf. Nur noch eine Sache: ${nextQuestion}`;
  }
  const options = candidates.length === 2 ? "two places" : "a few places";
  return `Okay${locationText} — I already have ${options} in mind. One more thing: ${nextQuestion}`;
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
  if (context.language.startsWith("nl")) {
    return "Ik heb echt geen tweede sterke plek met exact dezelfde voorkeuren zonder de vorige aanbeveling te herhalen. We kunnen het budget, de buurt of de sfeer iets aanpassen.";
  }

  if (context.language.startsWith("fr")) {
    return "Je n’ai vraiment pas une deuxième adresse solide avec exactement les mêmes préférences sans répéter la recommandation précédente. On peut ajuster le budget, le quartier ou l’ambiance.";
  }

  if (context.language.startsWith("de")) {
    return "Ich habe wirklich keinen zweiten starken Ort mit genau denselben Wünschen, ohne die vorherige Empfehlung zu wiederholen. Wir können Budget, Viertel oder Stimmung anpassen.";
  }

  return "I really do not have a second strong place with exactly the same preferences without repeating the previous recommendation. We can adjust the budget, neighbourhood, or vibe.";
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

export function isInformationalActiveRecommendationFollowUp(
  message: string,
  mentionedTopics: string[]
): boolean {
  const normalized = normalizePhraseText(message);
  const asksForExplanation = /^(?:wat is|wat zijn|wat betekent|wat bedoel je met|wie is|what is|what are|what does|what do you mean by|who is|qu est ce que|que signifie|qui est|c est quoi|was ist|was bedeutet|wer ist)\b/.test(normalized);
  const asksWhatWasMeant = /^(?:wat bedoel je met|what do you mean by|que veux tu dire par|que signifie|was meinst du mit|was bedeutet)\b/.test(normalized);
  const subject = normalized
    .replace(/^(?:wat is|wat zijn|wat betekent|wat bedoel je met|wie is|what is|what are|what does|what do you mean by|who is|qu est ce que|que signifie|qui est|c est quoi|was ist|was bedeutet|wer ist)\s+/, "")
    .replace(/^(?:eigenlijk|exactly|actually|precisely)\s+/, "")
    .trim();
  const mentionsRecommendationTopic = mentionedTopics.some((topic) => {
    const normalizedTopic = normalizePhraseText(topic);
    return containsNormalizedPhrase(normalized, topic) ||
      Boolean(subject && ` ${normalizedTopic} `.includes(` ${subject} `));
  });
  const contextualQuestion = /^(?:is dat|is het daar|kan ik daar|hoe ver|hoe duur|is that|is it|can i|how far|how expensive|est ce|c est|puis je|a quelle distance|ist das|ist es|kann ich|wie weit|wie teuer)\b/.test(normalized);

  return asksWhatWasMeant ||
    (mentionsRecommendationTopic && asksForExplanation) ||
    contextualQuestion;
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

function recommendationResult(
  place: Place,
  context: UserContext,
  message: string,
  score = 0
): ChatbotFlowResult {
  return {
    type: "recommendation",
    context,
    placeId: place.id,
    placeName: place.name,
    googleMapsUrl: place.googleMapsUrl,
    shortDescription: place.shortDescription,
    offscriptReason: place.offscriptReason,
    personalTip: place.personalTip,
    practicalInfo: place.practicalInfo,
    socialUrl: preferredSocialUrl(place),
    priceLevel: place.priceLevel,
    offscriptPickLevel: place.offscriptPickLevel,
    score,
    message: recommendationTitle(place),
    imageUrls: selectRecommendationImages(place, message)
  };
}

export async function runChatbotFlow(userPhone: string, message: string): Promise<ChatbotFlowResult> {
  let [previousContext, previousAssistantMessage, activeRecommendation, whatsappUser] = await Promise.all([
    getConversationContext(userPhone),
    getLastOutgoingMessage(userPhone),
    getLastRecommendedPlace(userPhone),
    getWhatsAppUser(userPhone)
  ]);
  if (whatsappUser?.homeNeighbourhood && !previousContext?.currentLocation) {
    previousContext = {
      ...(previousContext ?? { language: "fr", clarificationCount: 0 }),
      currentLocation: normalizeRegion(whatsappUser.homeNeighbourhood)
    };
  }
  let places: Place[] | undefined;
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

  const requestedLanguage = detectRequestedLanguage(message);
  const storyLanguage = resolveConversationLanguage(message, previousContext?.language, "fr");
  const knownRegion = findKnownRegion(message);
  const didStartNewSearch = !activeRecommendation && startsNewSearch(message, previousContext);
  if (didStartNewSearch) {
    previousContext = contextForNewSearch(previousContext, storyLanguage);
    await deleteRecommendationHistoryForUser(userPhone);
    activeRecommendation = null;
  }

  places ??= await listRecommendationPlaces(storyLanguage);
  const activePlace = activeRecommendation?.placeId
    ? places.find((place) => place.id === activeRecommendation?.placeId)
    : undefined;
  const activeMentionedTopics = activePlace ? [
    activePlace.name,
    activePlace.neighbourhood,
    activePlace.area,
    ...activePlace.categories,
    ...activePlace.subcategories.map((subcategory) => subcategory.name),
    ...activePlace.occasionTags,
    ...activePlace.vibeTags,
    activePlace.shortDescription,
    activePlace.offscriptReason,
    activePlace.personalTip,
    activePlace.practicalInfo,
    activePlace.story
  ].filter((topic): topic is string => Boolean(topic)) : [];
  const broadensExistingSearch = Boolean(
    previousContext?.intent &&
    previousContext.intent !== "unknown" &&
    (acceptsBroaderLocation(message) || acceptsAnyLocation(message))
  );
  const selectsRegionForExistingSearch = Boolean(
    previousContext?.intent &&
    previousContext.intent !== "unknown" &&
    isRegionOnlyReply(message, knownRegion)
  );
  const interpretation = broadensExistingSearch
    ? {
        context: {
          ...previousContext,
          language: storyLanguage,
          targetRegion: "Dakar",
          searchProfile: previousContext?.searchProfile
            ? {
                ...previousContext.searchProfile,
                neighbourhood: undefined,
                mobility: "dakar_wide" as const
              }
            : undefined
        } as UserContext,
        confidence: 1,
        route: "place_lookup" as const,
        recommendationAction: "find_alternative" as const,
        previousQuestionAction: "continue_search" as const,
        previousQuestionResolution: "accepted" as const
      }
    : selectsRegionForExistingSearch
      ? {
          context: {
            ...previousContext,
            language: storyLanguage,
            targetRegion: knownRegion,
            searchProfile: previousContext?.searchProfile
              ? {
                  ...previousContext.searchProfile,
                  neighbourhood: knownRegion,
                  mobility: "nearby" as const
                }
              : undefined
          } as UserContext,
          confidence: 1,
          route: "place_lookup" as const,
          recommendationAction: activeRecommendation ? "find_alternative" as const : "none" as const,
          previousQuestionAction: "continue_search" as const,
          previousQuestionResolution: "answered_with_detail" as const
        }
      : await buildUserContext({
        message,
        previousContext,
        previousAssistantMessage,
        activeRecommendation: activeRecommendation ? {
          placeName: activeRecommendation.placeName,
          needs: activeRecommendation.contextSnapshot ?? previousContext ?? { language: storyLanguage },
          mentionedTopics: activeMentionedTopics
        } : null,
        subcategoryTaxonomy: buildSubcategoryTaxonomy(places)
      });
  const context = interpretation.context;
  const recommendationNeeds = activeRecommendation?.contextSnapshot ?? previousContext ?? context;
  const isInformationalFollowUp = Boolean(
    activePlace &&
    isInformationalActiveRecommendationFollowUp(message, activeMentionedTopics)
  );

  if (
    activeRecommendation?.placeId &&
    (
      isInformationalFollowUp ||
      ["ask_about_place", "explain_match"].includes(interpretation.recommendationAction ?? "")
    )
  ) {
    const place = activePlace;
    if (place) {
      const followUpContext = {
        ...(previousContext ?? recommendationNeeds),
        language: storyLanguage
      };
      const followUpReply = await generatePlaceFollowUpReply({
        message,
        language: followUpContext.language,
        place,
        needs: recommendationNeeds
      });
      await upsertConversationContext(userPhone, followUpContext);
      return { type: "clarification", context: followUpContext, message: followUpReply };
    }
  }

  const continuesProposedSearch =
    interpretation.previousQuestionResolution === "accepted" &&
    (
      interpretation.previousQuestionAction === "continue_search" ||
      interpretation.route === "place_lookup"
    );

  const activeNeighbourhood = activePlace?.neighbourhood ?? activePlace?.area;
  const explicitlyChosenRegion = findKnownRegion(message);
  if (
    activeRecommendation &&
    activeNeighbourhood &&
    normalizeRegion(activeNeighbourhood) !== "Dakar" &&
    interpretation.recommendationAction === "find_alternative" &&
    !continuesProposedSearch &&
    !explicitlyChosenRegion &&
    !acceptsBroaderLocation(message)
  ) {
    const locationContext: UserContext = {
      ...context,
      currentLocation: context.currentLocation ?? activeNeighbourhood,
      targetRegion: activeNeighbourhood,
      language: storyLanguage
    };
    await upsertConversationContext(userPhone, locationContext);
    return {
      type: "clarification",
      context: locationContext,
      message: buildAlternativeLocationQuestion(storyLanguage, activeNeighbourhood)
    };
  }

  if (
    activeRecommendation &&
    interpretation.recommendationAction === "accept_recommendation" &&
    !continuesProposedSearch
  ) {
    const feedbackContext = { ...context, language: storyLanguage };
    await upsertConversationContext(userPhone, feedbackContext);
    return {
      type: "clarification",
      context: feedbackContext,
      message: buildRecommendationFeedbackReply(feedbackContext)
    };
  }

  const effectiveRoute = interpretation.recommendationAction === "find_alternative" || continuesProposedSearch
    ? "place_lookup"
    : interpretation.route;

  if (interpretation.recommendationAction === "new_search") {
    await deleteRecommendationHistoryForUser(userPhone);
    activeRecommendation = null;
  }

  if (effectiveRoute === "conversation") {
    await upsertConversationContext(userPhone, context);
    return {
      type: "clarification",
      context,
      message: interpretation.conversationReply ?? buildGreetingResponse(context)
    };
  }

  if (["needs_clarification", "place_lookup"].includes(effectiveRoute)) {
    const missingField = needsClarification(context, places);
    if (missingField) {
      const candidates = findClarificationCandidates(places, context);
      const contextAfterQuestion: UserContext = {
        ...context,
        clarificationCount: (context.clarificationCount ?? 0) + 1
      };
      const question = await generateClarifyingQuestion({
        missingField,
        context: contextAfterQuestion,
        candidates
      });
      await upsertConversationContext(userPhone, contextAfterQuestion);
      return {
        type: "clarification",
        context: contextAfterQuestion,
        message: question
      };
    }
  }

  const storyMatch = await findStoryKnowledgeMatch(message, storyLanguage);

  if (isFrustratedReply(message)) {
    const context = contextForNewSearch(previousContext, storyLanguage);
    await deleteConversationContext(userPhone);
    await deleteRecommendationHistoryForUser(userPhone);
    await upsertConversationContext(userPhone, context);
    return {
      type: "clarification",
      context,
      message: buildFrustrationRecovery(context)
    };
  }

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

  if (isPlaceInformationFollowUp(message)) {
    const lastRecommendedPlace = await getLastRecommendedPlace(userPhone);

    if (lastRecommendedPlace?.placeId) {
      places = await listRecommendationPlaces(storyLanguage);
      const place = places.find((candidate) => candidate.id === lastRecommendedPlace.placeId);

      if (place) {
        const context: UserContext = {
          ...previousContext,
          language: storyLanguage
        };
        const followUpReply = await generatePlaceFollowUpReply({
          message,
          language: context.language,
          place,
          needs: lastRecommendedPlace.contextSnapshot ?? previousContext ?? context
        });

        await upsertConversationContext(userPhone, context);

        return {
          type: "clarification",
          context,
          message: followUpReply
        };
      }
    }
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

  // Resolve explicit database place names before considering the message for
  // free conversation. Questions such as "What is Chez Iso?" must remain part
  // of the OFFSCRIPT place flow.
  places ??= await listRecommendationPlaces(storyLanguage);
  const explicitPlace = findExplicitPlaceRequest(message, places);
  if (explicitPlace) {
    const context: UserContext = {
      ...previousContext,
      language: storyLanguage,
      directRequest: true
    };
    await upsertConversationContext(userPhone, context);
    if (isPlaceInformationFollowUp(message)) {
      const followUpReply = await generatePlaceFollowUpReply({
        message,
        language: context.language,
        place: explicitPlace,
        needs: previousContext ?? context
      });
      return {
        type: "clarification",
        context,
        message: followUpReply
      };
    }
    return recommendationResult(explicitPlace, context, message);
  }

  await upsertConversationContext(userPhone, context);

  const recommendedPlaceIds = await listRecommendedPlaceIds(userPhone);
  const recommendedPlaceIdSet = new Set(recommendedPlaceIds);
  const newPlaces = places.filter((place) => !recommendedPlaceIdSet.has(place.id));
  const selection = selectBestPlace(newPlaces, context);

  if (!selection) {
    const alternativeSelection = selectBestAlternativePlace(newPlaces, context);

    if (alternativeSelection) {
      return recommendationResult(
        alternativeSelection.place,
        context,
        message,
        alternativeSelection.score
      );
    }

    if (newPlaces.length < places.length && selectBestPlace(places, context)) {
      return {
        type: "no_match",
        context,
        message: buildNoNewMatchResponse(context, activeRecommendation?.placeName)
      };
    }

    return {
      type: "no_match",
      context,
      message: buildNoMatchResponse(context)
    };
  }

  return recommendationResult(selection.place, context, message, selection.score);
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
  if (isCurrentEventRequest(input.message)) {
    let curatedVenues: CuratedEventVenue[] = [];
    try {
      const language = detectLanguage(input.message, "fr");
      const places = await listRecommendationPlaces(language);
      curatedVenues = places
        .sort((left, right) =>
          right.offscriptPickLevel - left.offscriptPickLevel ||
          right.offscriptPriority - left.offscriptPriority
        )
        .map((place) => ({
          name: place.name,
          area: place.area ?? place.neighbourhood
        }));
    } catch (error) {
      console.error("Could not load curated venues for current event search", error);
    }

    const currentEventReply = await findCurrentEvent(input.message, curatedVenues);
    return {
      reply: currentEventReply ?? "",
      followUpMessages: [],
      locationActions: [],
      imageUrls: [],
      afterMediaMessages: []
    };
  }

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
  const recommendationMessages = localizedRecommendation
    ? [
        localizedRecommendation.shortDescription,
        localizedRecommendation.personalTip,
        localizedRecommendation.practicalInfo
      ]
    : [];
  const whatsAppContactLine =
    result.type === "recommendation" && mentionsWhatsApp(recommendationMessages)
      ? buildWhatsAppContactLine(
          result.context,
          await listPlaceContactDetails(result.placeId)
        )
      : undefined;
  const followUpMessages =
    result.type === "recommendation" && localizedRecommendation
      ? [
          localizedRecommendation.shortDescription,
          localizedRecommendation.personalTip,
          localizedRecommendation.practicalInfo,
          whatsAppContactLine,
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
      placeName: result.placeName,
      context: result.context
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
