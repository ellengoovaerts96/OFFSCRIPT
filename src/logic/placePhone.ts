/** Store international numbers so calling and WhatsApp work across countries. */
export function normalizePlacePhone(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const phone = raw.replace(/[\s().-]/g, "").replace(/^00/, "+");
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    throw new Error("Enter a phone number with country code, e.g. +221771234567.");
  }
  return phone;
}

export function placePhoneMessage(value: string | null | undefined, placeName?: string): string | undefined {
  try {
    const phone = normalizePlacePhone(value);
    // A standalone international number is recognized by WhatsApp as a callable number.
    const name = placeName?.replace(/[\r\n*_~`]/g, " ").replace(/\s+/g, " ").trim();
    const heading = name ? `*Contact · ${name}*\n` : "";
    return phone ? `${heading}📞 ${phone}\n💬 WhatsApp: https://wa.me/${phone.slice(1)}` : undefined;
  } catch {
    // Older imported numbers may lack a country code; never guess a destination.
    return undefined;
  }
}
