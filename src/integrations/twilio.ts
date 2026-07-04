import twilio from "twilio";

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_FROM;

export async function sendWhatsAppMessage(to: string, body?: string, mediaUrl?: string[]): Promise<void> {
  if (!twilioWhatsAppFrom) {
    throw new Error("TWILIO_WHATSAPP_FROM is not configured.");
  }

  await twilioClient.messages.create({
    from: twilioWhatsAppFrom,
    to,
    ...(body ? { body } : {}),
    mediaUrl
  });
}
