import { Router } from "express";
import { createChatMessage } from "../data/chatMessagesRepository.js";
import { canSendWhatsAppMessage, sendWhatsAppMessage } from "../integrations/twilio.js";
import { handleChatMessage } from "../logic/chatbotFlow.js";

export const whatsappRouter = Router();

whatsappRouter.post("/", async (req, res) => {
  try {
    const incomingMessage = String(req.body.Body ?? "").trim();
    const from = String(req.body.From ?? "");
    const twilioTo = String(req.body.To ?? "");

    if (!incomingMessage || !from) {
      sendTwilioMessages(res, ["Send a message to start."]);
      return;
    }

    await logChatMessage(from, "incoming", incomingMessage);

    const { reply, followUpMessages, imageUrls, afterMediaMessages } = await handleChatMessage({
      userPhone: from,
      message: incomingMessage
    });

    await logChatMessage(from, "outgoing", reply);

    if (canSendWhatsAppMessage(twilioTo)) {
      sendTwilioMessages(res, [reply]);
      scheduleRecommendationFollowUps(from, twilioTo, followUpMessages, imageUrls, afterMediaMessages);
      return;
    }

    if (followUpMessages.length || imageUrls.length || afterMediaMessages.length) {
      console.error(
        "Delayed WhatsApp recommendation follow-ups are unavailable. Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM to send Maps, photos and the closing question after the description."
      );
    }

    sendTwilioMessages(res, [reply]);
  } catch (error) {
    console.error("WhatsApp webhook failed", error);
    sendTwilioMessages(res, ["OFFSCRIPT had a small hiccup. Try again in a moment."]);
  }
});

async function logChatMessage(
  userPhone: string,
  direction: "incoming" | "outgoing",
  message: string
): Promise<void> {
  try {
    await createChatMessage({ userPhone, direction, message });
  } catch (error) {
    console.error(`Could not log ${direction} WhatsApp message`, error);
  }
}

function sendTwilioMessages(
  res: { type: (value: string) => { send: (body: string) => void } },
  messages: string[]
): void {
  const textMessages = messages.map((message) => `<Message><Body>${escapeXml(message)}</Body></Message>`).join("");

  res.type("text/xml").send(`<Response>${textMessages}</Response>`);
}

function scheduleRecommendationFollowUps(
  to: string,
  fromOverride: string,
  followUpMessages: string[],
  imageUrls: string[],
  afterMediaMessages: string[]
): void {
  if (!followUpMessages.length && !imageUrls.length && !afterMediaMessages.length) return;

  setTimeout(() => {
    void sendRecommendationFollowUps(to, fromOverride, followUpMessages, imageUrls, afterMediaMessages);
  }, 1500);
}

async function sendRecommendationFollowUps(
  to: string,
  fromOverride: string,
  followUpMessages: string[],
  imageUrls: string[],
  afterMediaMessages: string[]
): Promise<void> {
  for (const message of followUpMessages) {
    try {
      await sendWhatsAppMessage(to, message, undefined, fromOverride);
      await logChatMessage(to, "outgoing", message);
    } catch (error) {
      console.error("Could not send delayed WhatsApp follow-up", error);
    }
  }

  for (const imageUrl of imageUrls) {
    try {
      await sendWhatsAppMessage(to, undefined, [imageUrl], fromOverride);
      await wait(800);
    } catch (error) {
      console.error("Could not send delayed WhatsApp media", error);
    }
  }

  if (imageUrls.length) {
    await wait(1500);
  }

  for (const message of afterMediaMessages) {
    try {
      await sendWhatsAppMessage(to, message, undefined, fromOverride);
      await logChatMessage(to, "outgoing", message);
    } catch (error) {
      console.error("Could not send delayed WhatsApp after-media message", error);
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
