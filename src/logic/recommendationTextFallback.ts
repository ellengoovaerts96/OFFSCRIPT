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

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function segments(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  return value
    .split(/\n+/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      if (/^(?:[-*•]|\p{Extended_Pictographic})/u.test(trimmed)) return [trimmed];
      return trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()) ?? [];
    });
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(" ").filter((token) => token.length > 2));
}

function isRepetition(left: string, right: string): boolean {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  if (
    Math.min(normalizedLeft.length, normalizedRight.length) >= 24 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  ) {
    return true;
  }

  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (Math.min(leftTokens.size, rightTokens.size) < 5) return false;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 && overlap / union >= 0.8;
}

function uniqueSegments(value: string | undefined, blocked: string[] = []): string[] {
  const accepted: string[] = [];
  for (const segment of segments(value)) {
    if ([...blocked, ...accepted].some((existing) => isRepetition(segment, existing))) continue;
    accepted.push(segment);
  }
  return accepted;
}

function joinSegments(values: string[], source: string | undefined): string | undefined {
  if (!values.length) return undefined;
  return values.join(source?.includes("\n") ? "\n" : " ");
}

export function deduplicateRecommendationText(
  input: RecommendationTextFallback
): RecommendationTextFallback {
  // Keep the personal tip as its own editorial voice. Remove an overlapping
  // sentence from the description instead, unless that would erase the whole
  // description.
  let personalTipSegments = uniqueSegments(input.personalTip);
  let descriptionSegments = uniqueSegments(input.shortDescription, personalTipSegments);
  if (!descriptionSegments.length) {
    descriptionSegments = uniqueSegments(input.shortDescription);
    personalTipSegments = [];
  }

  return {
    shortDescription:
      joinSegments(descriptionSegments, input.shortDescription) ?? input.shortDescription.trim(),
    personalTip: joinSegments(personalTipSegments, input.personalTip),
    // Practical info is source data, not editorial prose. Preserve every line,
    // even when a fact also appears in the recommendation or personal tip.
    practicalInfo: input.practicalInfo?.trim() || undefined
  };
}

export function buildRecommendationTextFallback(
  input: RecommendationTextSource
): RecommendationTextFallback {
  return deduplicateRecommendationText({
    shortDescription: [input.offscriptReason, input.shortDescription]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(" "),
    personalTip: input.personalTip?.trim() || undefined,
    practicalInfo: input.practicalInfo?.trim() || undefined
  });
}
