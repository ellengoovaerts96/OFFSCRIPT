export type RecommendationFeedbackRating = "loved" | "okay" | "disliked" | "did_not_go";
export type RecommendationFeedbackReason =
  | "too_touristy"
  | "too_expensive"
  | "wrong_vibe"
  | "too_far"
  | "food_drinks"
  | "something_else";

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function parseRecommendationFeedbackRating(message: string): RecommendationFeedbackRating | undefined {
  const value = normalize(message);
  if (/\b(?:suggestion|recommendation|recommandation|tip|idee|idea|vorschlag)\b/.test(value)) {
    return undefined;
  }
  if (/^(?:i went|we went|i tried it|we tried it).*(?:loved it|love it|great|amazing)$/.test(value)) return "loved";
  if (/^(?:j y suis alle|nous y sommes alles|j ai essaye).*(?:j ai adore|adore|genial|super)$/.test(value)) return "loved";
  if (/^(?:ik ben geweest|we zijn geweest|ik heb het geprobeerd).*(?:geweldig|heel goed|super|fantastisch)$/.test(value)) return "loved";
  if (/^(?:ich war dort|wir waren dort|ich habe es ausprobiert).*(?:sehr gefallen|toll|super)$/.test(value)) return "loved";
  if (/^(?:j ai aime|j ai adore)(?:\s+ca)?(?:\s+.*)?$/.test(value)) return "loved";
  if (/^(?:i liked it|i loved it|we liked it|we loved it)(?:\s+.*)?$/.test(value)) return "loved";
  if (/^(?:ik vond het goed|ik vond het geweldig|we vonden het goed|we vonden het geweldig)(?:\s+.*)?$/.test(value)) return "loved";
  if (/^(?:es hat mir gefallen|es hat uns gefallen)(?:\s+.*)?$/.test(value)) return "loved";
  if (/^(?:i went|we went|i tried it|we tried it).*(?:it was okay|it was ok|okay)$/.test(value)) return "okay";
  if (/^(?:j y suis alle|nous y sommes alles|j ai essaye).*(?:c etait correct|c etait bien|ca allait)$/.test(value)) return "okay";
  if (/^(?:ik ben geweest|we zijn geweest|ik heb het geprobeerd).*(?:het was oke?|het was wel goed|oke?)$/.test(value)) return "okay";
  if (/^(?:i went|we went|i tried it|we tried it).*(?:not for me|didn t like it|did not like it)$/.test(value)) return "disliked";
  if (/^(?:j y suis alle|nous y sommes alles|j ai essaye).*(?:pas pour moi|je n ai pas aime)$/.test(value)) return "disliked";
  if (/^(?:ik ben geweest|we zijn geweest|ik heb het geprobeerd).*(?:niet voor mij|vond het niet leuk)$/.test(value)) return "disliked";
  if (/^(?:didn t go|did not go|i didn t go|je n y suis pas alle|pas alle|niet geweest|ik ben niet gegaan|nicht hingegangen)$/.test(value)) return "did_not_go";
  return undefined;
}

export function parseRecommendationFeedbackReason(message: string): RecommendationFeedbackReason | undefined {
  const value = normalize(message);
  if (/^(?:too touristy|trop touristique|te toeristisch|zu touristisch)$/.test(value)) return "too_touristy";
  if (/^(?:too expensive|trop cher|te duur|zu teuer)$/.test(value)) return "too_expensive";
  if (/^(?:wrong vibe|mauvaise ambiance|verkeerde sfeer|falsche stimmung)$/.test(value)) return "wrong_vibe";
  if (/^(?:too far|trop loin|te ver|zu weit)$/.test(value)) return "too_far";
  if (/^(?:food drinks|food or drinks|nourriture boissons|eten drinken|essen getranke)$/.test(value)) return "food_drinks";
  if (/^(?:something else|autre chose|iets anders|etwas anderes)$/.test(value)) return "something_else";
  return undefined;
}

export function buildFeedbackPrompt(language: string): string {
  if (language.startsWith("nl")) return "Als je gaat, mag je me achteraf gewoon sturen: 👍 geweldig · 😐 oké · 👎 niet voor mij · 🚫 niet geweest.";
  if (language.startsWith("en")) return "If you go, just tell me afterwards: 👍 loved it · 😐 it was okay · 👎 not for me · 🚫 didn’t go.";
  if (language.startsWith("de")) return "Wenn du hingehst, schreib mir danach einfach: 👍 toll · 😐 okay · 👎 nichts für mich · 🚫 nicht hingegangen.";
  return "Si tu y vas, dis-moi simplement après : 👍 adoré · 😐 correct · 👎 pas pour moi · 🚫 pas allé.";
}

export function buildFeedbackReasonQuestion(language: string): string {
  if (language.startsWith("nl")) return "Wat klopte er niet? Te toeristisch · te duur · verkeerde sfeer · te ver · eten/drinken · iets anders";
  if (language.startsWith("en")) return "What was off? Too touristy · too expensive · wrong vibe · too far · food/drinks · something else";
  if (language.startsWith("de")) return "Was hat nicht gepasst? Zu touristisch · zu teuer · falsche Stimmung · zu weit · Essen/Getränke · etwas anderes";
  return "Qu’est-ce qui n’allait pas ? Trop touristique · trop cher · mauvaise ambiance · trop loin · nourriture/boissons · autre chose";
}

export function buildFeedbackThanks(language: string, rating: RecommendationFeedbackRating): string {
  if (rating === "loved") {
    if (language.startsWith("nl")) return "Leuk om te horen 😌 Dat onthoud ik voor je volgende tip.";
    if (language.startsWith("en")) return "Nice 😌 I’ll keep that in mind for your next tip.";
    if (language.startsWith("de")) return "Schön zu hören 😌 Das merke ich mir für deinen nächsten Tipp.";
    return "Génial 😌 Je le garde en tête pour ta prochaine recommandation.";
  }
  if (language.startsWith("nl")) return "Dank je, dat helpt me om betere tips te geven.";
  if (language.startsWith("en")) return "Thanks — that helps me give better tips.";
  if (language.startsWith("de")) return "Danke — das hilft mir, bessere Tipps zu geben.";
  return "Merci — ça m’aide à mieux choisir mes prochaines recommandations.";
}

export function buildFreeTextPrompt(language: string): string {
  if (language.startsWith("nl")) return "Vertel maar — zelfs één zin helpt.";
  if (language.startsWith("en")) return "Tell me — even one sentence helps.";
  if (language.startsWith("de")) return "Erzähl kurz — selbst ein Satz hilft.";
  return "Dis-moi — même une seule phrase m’aide.";
}
