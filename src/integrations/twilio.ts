import twilio from "twilio";

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_FROM;
