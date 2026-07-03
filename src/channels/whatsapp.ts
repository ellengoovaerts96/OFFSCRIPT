import { Router } from "express";
import { createChatMessage } from "../data/chatMessagesRepository.js";
import { sendWhatsAppMessage } from "../integrations/twilio.js";
import { handleChatMessage } from "../logic/chatbotFlow.js";

export const whatsappRouter = Router();

whatsappRouter.post("/", async (req, res) => {
  try {
    const incomingMessage = String(req.body.Body ?? "").trim();
    const from = String(req.body.From ?? "");

    if (!incomingMessage || !from) {
      sendTwilioMessages(res, ["Send a message to start."]);
      return;
    }

    await logChatMessage(from, "incoming", incomingMessage);

    const { reply, followUpMessages, imageUrls, afterMediaMessages } = await handleChatMessage({
      userPhone: from,
      message: incomingMessage
    });

    const outgoingMessages = [reply, ...followUpMessages];

    for (const outgoingMessage of outgoingMessages) {
      await logChatMessage(from, "outgoing", outgoingMessage);
    }

    sendTwilioMessages(res, outgoingMessages, imageUrls);
    scheduleAfterMediaMessages(from, afterMediaMessages);
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
  messages: string[],
  imageUrls: string[] = []
): void {
  const textMessages = messages.map((message) => `<Message><Body>${escapeXml(message)}</Body></Message>`).join("");
  const mediaMessages = imageUrls.map((url) => `<Message><Media>${escapeXml(url)}</Media></Message>`).join("");

  res.type("text/xml").send(`<Response>${textMessages}${mediaMessages}</Response>`);
}

function scheduleAfterMediaMessages(to: string, messages: string[]): void {
  if (!messages.length) return;

  setTimeout(() => {
    void sendDelayedMessages(to, messages);
  }, 2500);
}

async function sendDelayedMessages(to: string, messages: string[]): Promise<void> {
  for (const message of messages) {
    try {
      await sendWhatsAppMessage(to, message);
      await logChatMessage(to, "outgoing", message);
    } catch (error) {
      console.error("Could not send delayed WhatsApp message", error);
    }
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
