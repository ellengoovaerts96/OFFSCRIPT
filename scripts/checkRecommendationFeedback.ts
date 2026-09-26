import {
  buildFeedbackPrompt,
  buildRecommendationAcceptanceReply,
  buildRecommendationEnjoyReply,
  buildSpontaneousFeedbackInvitation,
  buildFeedbackRatingQuestion,
  buildPositiveFeedbackQuestion,
  hasFeedbackDetail,
  isFeedbackRatingQuestion,
  isExplicitRecommendationChoice,
  isRecommendationSearchRequest,
  isRecommendationExperienceSignal,
  parseRecommendationFeedbackRating,
  parseRecommendationFeedbackReason
} from "../src/logic/recommendationFeedback.js";
import { resolveConversationLanguage } from "../src/ai/detectLanguage.js";
import { isRecommendationFeedbackOnly } from "../src/logic/chatbotFlow.js";

const ratings = [
  ["I went and loved it", "loved"],
  ["J’y suis allé, j’ai adoré", "loved"],
  ["J’ai aimé! Prix/qualité super", "loved"],
  ["Ik ben geweest en het was oké", "okay"],
  ["J’y suis allé, pas pour moi", "disliked"],
  ["ik was niet zo tevreden", "disliked"],
  ["Het viel tegen", "disliked"],
  ["Je n’étais pas très satisfait", "disliked"],
  ["I wasn't very happy", "disliked"],
  ["🚫 Niet geweest", "did_not_go"]
] as const;

for (const [message, expected] of ratings) {
  if (parseRecommendationFeedbackRating(message) !== expected) {
    throw new Error(`Feedback rating mismatch for ${message}.`);
  }
}

const reasons = [
  ["Trop touristique", "too_touristy"],
  ["Te duur", "too_expensive"],
  ["Wrong vibe", "wrong_vibe"],
  ["Zu weit", "too_far"],
  ["Nourriture/boissons", "food_drinks"],
  ["Iets anders", "something_else"]
] as const;

for (const [message, expected] of reasons) {
  if (parseRecommendationFeedbackReason(message) !== expected) {
    throw new Error(`Feedback reason mismatch for ${message}.`);
  }
}

if (parseRecommendationFeedbackRating("Ik wil ergens eten") !== undefined) {
  throw new Error("A new search request must not be mistaken for place feedback.");
}
if (parseRecommendationFeedbackRating("Ik ben niet tevreden met deze suggestie") !== undefined) {
  throw new Error("Rejecting a suggestion before visiting must not be stored as experience feedback.");
}
if (!isRecommendationExperienceSignal("Het was lekker")) {
  throw new Error("A natural post-visit remark must start the lightweight feedback question.");
}
if (!isRecommendationFeedbackOnly("Ziet er perfect uit! Dank je")) {
  throw new Error("A natural acknowledgement of a recommendation must stay in the feedback flow.");
}
if (resolveConversationLanguage("Ziet er perfect uit! Dank je", "fr") !== "nl") {
  throw new Error("A clear Dutch acknowledgement must switch the reply language to Dutch.");
}
const ratingQuestion = buildFeedbackRatingQuestion("nl");
if (!isFeedbackRatingQuestion(ratingQuestion)) {
  throw new Error("The generated feedback question must be recognizable on the next turn.");
}
if (parseRecommendationFeedbackRating("👍") !== undefined) {
  throw new Error("A bare emoji must not be feedback before TUUTI asks the feedback question.");
}
if (parseRecommendationFeedbackRating("👍", { allowShortOptions: true }) !== "loved") {
  throw new Error("A bare emoji must resolve after TUUTI asks the feedback question.");
}
for (const prematureReaction of ["Top", "Parfait", "👍", "J’adore cette suggestion", "J’ai aimé la suggestion"]) {
  if (parseRecommendationFeedbackRating(prematureReaction) !== undefined) {
    throw new Error(`${prematureReaction} must not be treated as proof that the user visited the place.`);
  }
}
if (!buildFeedbackPrompt("fr").includes("🚫")) {
  throw new Error("The feedback prompt must include a did-not-go option.");
}
if (buildSpontaneousFeedbackInvitation("nl") !== "Ga je erheen? Laat me achteraf weten wat je ervan vond 💛") {
  throw new Error("The Dutch recommendation invitation must stay subtle and conversational.");
}
if (!buildSpontaneousFeedbackInvitation("fr").includes("dis-moi après")) {
  throw new Error("The spontaneous feedback invitation must be localized.");
}
if (!buildRecommendationAcceptanceReply("nl", "Pizzammore").includes("Pizzammore")) {
  throw new Error("An accepted place must receive a named, warm feedback invitation.");
}
if (buildRecommendationEnjoyReply("nl", "Prieto").toLowerCase().includes("feedback")) {
  throw new Error("An accepted recommendation must not repeat a feedback request already shown in the flow.");
}
if (!hasFeedbackDetail("Er werd niet gedanst bij Prieto", "Prieto")) {
  throw new Error("A missing advertised activity is already a concrete feedback reason.");
}
for (const choice of ["Perfect, we gaan naar Pizzammore", "We kiezen 11 Players", "On va chez Pizzammore", "We'll go to Pizzammore"]) {
  if (!isExplicitRecommendationChoice(choice)) throw new Error(`${choice} must be recognized as a concrete choice.`);
}
for (const acknowledgement of ["Dank je", "Ziet er goed uit", "Perfecte suggestie"]) {
  if (isExplicitRecommendationChoice(acknowledgement)) throw new Error(`${acknowledgement} is not yet a concrete choice.`);
}
if (!buildPositiveFeedbackQuestion("fr").includes("rapport qualité-prix")) {
  throw new Error("Positive feedback must get one natural, useful follow-up question.");
}
for (const request of ["Een goede padelclub", "Ik zoek een kunstgalerie", "Where can I play padel?", "Je cherche un bon restaurant"]) {
  if (!isRecommendationSearchRequest(request)) throw new Error(`${request} must bypass feedback interpretation.`);
}
for (const review of ["Pizzammore was echt geweldig!", "De pizza was fantastisch", "Het viel tegen"]) {
  if (isRecommendationSearchRequest(review)) throw new Error(`${review} must remain eligible for feedback interpretation.`);
}

console.log("Recommendation feedback checks passed.");
