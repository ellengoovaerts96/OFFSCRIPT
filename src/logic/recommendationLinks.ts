export function cleanExternalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(?:fbclid|igshid|g_st|share|utm_.+)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function formatSocialLink(value: string): string {
  const url = cleanExternalUrl(value);
  let label = "Website";

  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("instagram.com")) label = "Instagram";
    else if (host.includes("tiktok.com")) label = "TikTok";
    else if (host.includes("facebook.com") || host === "fb.com") label = "Facebook";
  } catch {
    // Keep the generic label for legacy values that are not valid URLs.
  }

  return `📸 *${label}*\n${url}`;
}

export function formatMapsLink(value: string): string {
  return `📍 *Google Maps*\n${cleanExternalUrl(value)}`;
}

export function buildLocationAction(input: {
  latitude?: number;
  longitude?: number;
  placeName: string;
}): string | undefined {
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) return undefined;
  return `geo:${input.latitude},${input.longitude}|${input.placeName}`;
}

export function locationActionLabel(action: string): string {
  return action.split("|", 2)[1]?.trim() || "Locatie";
}
