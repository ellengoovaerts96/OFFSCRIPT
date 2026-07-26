export type RecommendationTextSource = {
  shortDescription: string;
  offscriptReason?: string;
  personalTip?: string;
  practicalInfo?: string;
};

export type RecommendationTextFallback = {
  shortDescription: string;
  personalTip?: string;
  practicalInfo?: string;
};

export function buildRecommendationTextFallback(
  input: RecommendationTextSource
): RecommendationTextFallback {
  return {
    shortDescription: [input.offscriptReason, input.shortDescription]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(" "),
    personalTip: input.personalTip?.trim() || undefined,
    practicalInfo: input.practicalInfo?.trim() || undefined
  };
}
