import twilio from "twilio";

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_FROM;

export function canSendWhatsAppMessage(fromOverride?: string): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (twilioWhatsAppFrom || fromOverride));
}

export async function sendWhatsAppMessage(
  to: string,
  body?: string,
  mediaUrl?: string[],
  fromOverride?: string,
  persistentAction?: string[]
): Promise<void> {
  const from = twilioWhatsAppFrom || fromOverride;

  if (!from) {
    throw new Error("TWILIO_WHATSAPP_FROM is not configured and no webhook To number was available.");
  }

  await twilioClient.messages.create({
    from,
    to,
    ...(body ? { body } : {}),
    ...(mediaUrl?.length ? { mediaUrl } : {}),
    ...(persistentAction?.length ? { persistentAction } : {})
  });
}
