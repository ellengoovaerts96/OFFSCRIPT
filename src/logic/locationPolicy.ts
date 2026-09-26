import type { UserContext } from "../types/userContext.js";
import type { LocationPolicy } from "../types/searchProfile.js";
import { findKnownRegion, normalizeSupportedRegion } from "../utils/normalizeRegion.js";

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, " ");

/** Legacy currentLocation is accommodation context; legacy targetRegion is an explicit destination. */
export function locationPolicy(context: UserContext): LocationPolicy {
  const stored = context.searchProfile?.locationPolicy;
  const currentRegion = normalizeSupportedRegion(stored ? stored.currentRegion : context.currentLocation);
  const legacyTarget = normalizeSupportedRegion(context.targetRegion);
  return {
    currentRegion,
    preferredRegion: normalizeSupportedRegion(stored?.preferredRegion ?? currentRegion),
    requiredRegion: normalizeSupportedRegion(stored?.requiredRegion ?? (!stored && legacyTarget !== "Dakar" ? legacyTarget : undefined)),
    willingToTravel: stored?.willingToTravel ?? "unknown",
    proximityRequired: stored?.proximityRequired ?? false
  };
}

/** Only user evidence, never an AI-inferred destination, may create a hard boundary. */
export function applyLocationPolicy(
  message: string, context: UserContext, previous?: UserContext | null,
  previousAssistantMessage?: string | null, newSearch = false
): UserContext {
  const prior = locationPolicy(previous ?? { language: context.language });
  const policy: LocationPolicy = { ...prior };
  if (newSearch) {
    // Proximity belongs to the request that expressed it. A new activity is
    // Dakar-wide again unless the traveller repeats a nearby constraint.
    policy.requiredRegion = undefined;
    policy.preferredRegion = prior.currentRegion;
    policy.proximityRequired = false;
    policy.willingToTravel = "unknown";
  }
  const text = normalize(message);
  const region = normalizeSupportedRegion(findKnownRegion(message));
  const regionOnly = Boolean(region && /^(?:yoff|ngor|ouakam|oakam|(?:les )?mamelles|(?:pointe (?:des )?)?almadies|dakar)[.!?\s]*$/.test(text.trim()));
  const askedCurrent = /(?:where are you|which neighbou?rhood are you|in welke buurt ben je|waar ben je|ou es.tu|dans quel quartier es.tu|wo bist du)/.test(normalize(previousAssistantMessage ?? ""));
  const statesCurrent = /(?:i (?:am|m| m)(?: now| currently)? in|i (?:stay|live|am staying|m staying) in|we (?:are|re)(?: now)? in|ik (?:ben(?: nu)?|verblijf|logeer|woon) in|wij (?:zijn|verblijven) in|je (?:suis|loge|reste|sejourne) (?:a|au)|j habite (?:a|au)|nous sommes (?:a|au)|ich (?:bin(?: jetzt)?|wohne|bleibe) in)\b/.test(text);
  const nearby = /\b(?:near me|nearby|walking distance|on foot|no taxi|don t want to take a taxi|dichtbij|in de buurt|op loopafstand|te voet|geen taxi|pres de moi|a proximite|accessible a pied|distance de marche|pas de taxi|in meiner nahe|zu fuss|kein taxi)\b/.test(text);
  const broad = /\b(?:anywhere|anywhere in dakar|another (?:dakar )?neighbou?rhood|another area|broader|overal|andere buurt|andere wijk|breder|n importe ou|autre quartier|plus largement|uberall|anderes viertel)\b/.test(text);
  const accepts = /^(?:yes|yeah|sure|absolutely|no problem|okay|ok|ja|jazeker|zeker|graag|geen probleem|oke|oui|bien sur|d accord|ca va|c est bon|volontiers|ja gerne|naturlich|kein problem|gerne)[!.\s]*$/.test(text.trim());
  const offeredBroadening = /(?:another (?:dakar )?neighbou?rhood|another area|other area|andere buurt|andere wijk|autre quartier|autre zone|anderes viertel|andere gegend)/.test(normalize(previousAssistantMessage ?? ""));
  const rejectsTravel = /\b(?:no|not|don t|niet|geen|pas|nein|nicht)\b/.test(text);
  if (((!rejectsTravel && broad) || (accepts && offeredBroadening)) && !nearby) {
    policy.requiredRegion = undefined;
    policy.proximityRequired = false;
    policy.willingToTravel = "yes";
  }
  const originStatement = region && (statesCurrent || (regionOnly && (askedCurrent || !prior.currentRegion)));
  if (originStatement) {
    policy.currentRegion = region;
    policy.preferredRegion = region;
    // An explicit move replaces the old local boundary, but keeps a no-travel preference.
    if (policy.willingToTravel === "no" || policy.proximityRequired) policy.requiredRegion = region;
  } else if (region) {
    policy.preferredRegion = region;
    policy.requiredRegion = region === "Dakar" ? undefined : region;
    if (region === "Dakar") policy.willingToTravel = "yes";
  }
  if (nearby) {
    policy.proximityRequired = true;
    policy.willingToTravel = "no";
    policy.requiredRegion = region ?? policy.currentRegion;
  }
  return {
    ...context,
    currentLocation: policy.currentRegion,
    targetRegion: policy.requiredRegion ?? (policy.willingToTravel === "yes" ? "Dakar" : undefined),
    searchProfile: {
      ...(context.searchProfile ?? { products: [], locationFeatures: [], occasions: [], vibes: [], amenities: [], dietaryRequirements: [], exclusions: { products: [], categories: [], audienceTags: [], dietary: [] } }),
      locationPolicy: policy,
      neighbourhood: policy.requiredRegion,
      mobility: policy.requiredRegion || policy.proximityRequired ? "nearby" : "dakar_wide"
    }
  };
}

export function outsideLocationNotice(context: UserContext, destination: string): string | undefined {
  const policy = locationPolicy(context);
  if (!policy.proximityRequired) return undefined;
  const origin = policy.currentRegion;
  if (!origin || origin === "Dakar") return undefined;
  const lang = context.language.slice(0, 2);
  return ({
    nl: `Deze plek ligt in ${destination}, buiten ${origin}, waar je bent of verblijft.`,
    fr: `Cette adresse est à ${destination}, en dehors de ${origin}, où tu te trouves ou séjournes.`,
    de: `Dieser Ort liegt in ${destination}, außerhalb von ${origin}, wo du dich aufhältst.`,
    en: `This place is in ${destination}, outside ${origin}, where you are based.`
  } as Record<string, string>)[lang] ?? `This place is in ${destination}, outside ${origin}, where you are based.`;
}
