import type { Place } from "../types/place.js";

function explicitlyRefersToTikTok(place: Place): boolean {
  const editorialText = [
    place.shortDescription,
    place.offscriptReason,
    place.personalTip,
    place.practicalInfo,
    place.story,
    place.transport,
    ...place.bestFor,
    ...place.notIdealFor,
    ...place.subcategories.flatMap((subcategory) => [
      subcategory.name,
      subcategory.description
    ])
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return /\btik\s*tok\b/i.test(editorialText);
}

export function preferredSocialUrl(place: Place): string | undefined {
  if (place.tiktokUrl && explicitlyRefersToTikTok(place)) {
    return place.tiktokUrl;
  }

  return place.instagramUrl ?? place.tiktokUrl ?? place.facebookUrl;
}
