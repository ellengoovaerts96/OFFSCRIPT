import {
  buildFeedbackPrompt,
  parseRecommendationFeedbackRating,
  parseRecommendationFeedbackReason
} from "../src/logic/recommendationFeedback.js";

const ratings = [
  ["I went and loved it", "loved"],
  ["J’y suis allé, j’ai adoré", "loved"],
  ["J’ai aimé! Prix/qualité super", "loved"],
  ["Ik ben geweest en het was oké", "okay"],
  ["J’y suis allé, pas pour moi", "disliked"],
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
for (const prematureReaction of ["Top", "Parfait", "👍", "J’adore cette suggestion", "J’ai aimé la suggestion"]) {
  if (parseRecommendationFeedbackRating(prematureReaction) !== undefined) {
    throw new Error(`${prematureReaction} must not be treated as proof that the user visited the place.`);
  }
}
if (!buildFeedbackPrompt("fr").includes("🚫")) {
  throw new Error("The feedback prompt must include a did-not-go option.");
}

console.log("Recommendation feedback checks passed.");
