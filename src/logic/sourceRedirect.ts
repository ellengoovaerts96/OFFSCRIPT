import type { AcquisitionSource } from "../types/source.js";

export function publicWhatsAppNumber(): string | undefined {
  return process.env.TUUTI_PUBLIC_WHATSAPP_NUMBER ?? process.env.TWILIO_WHATSAPP_FROM;
}

function whatsappDigits(value: string): string {
  return value.replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

export function buildSourceWhatsAppUrl(
  source: AcquisitionSource,
  configuredNumber = publicWhatsAppNumber()
): string | null {
  if (!configuredNumber) return null;
  const digits = whatsappDigits(configuredNumber);
  if (!digits) return null;

  const message = `Start TUUTI · SRC:${source.code}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
