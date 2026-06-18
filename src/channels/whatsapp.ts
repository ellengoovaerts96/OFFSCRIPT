import { Router } from "express";
import { createChatMessage } from "../data/chatMessagesRepository.js";
import { handleChatMessage } from "../logic/chatbotFlow.js";

export const whatsappRouter = Router();

whatsappRouter.post("/", async (req, res) => {
  try {
    const incomingMessage = String(req.body.Body ?? "").trim();
    const from = String(req.body.From ?? "");

    if (!incomingMessage || !from) {
      sendTwilioMessage(res, "Send a message to start.");
      return;
    }

    await logChatMessage(from, "incoming", incomingMessage);

    const { reply, imageUrls } = await handleChatMessage({
      userPhone: from,
      message: incomingMessage
    });

    await logChatMessage(from, "outgoing", reply);
    sendTwilioMessage(res, reply, imageUrls);
  } catch (error) {
    console.error("WhatsApp webhook failed", error);
    sendTwilioMessage(res, "OFFSCRIPT had a small hiccup. Try again in a moment.");
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

function sendTwilioMessage(
  res: { type: (value: string) => { send: (body: string) => void } },
  message: string,
  imageUrls: string[] = []
): void {
  const textMessage = `<Message><Body>${escapeXml(message)}</Body></Message>`;
  const mediaMessages = imageUrls.map((url) => `<Message><Media>${escapeXml(url)}</Media></Message>`).join("");

  res.type("text/xml").send(`<Response>${textMessage}${mediaMessages}</Response>`);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
