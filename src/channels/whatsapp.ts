import { Router } from "express";
import { handleChatMessage } from "../logic/chatbotFlow.js";

export const whatsappRouter = Router();

whatsappRouter.post("/", async (req, res) => {
  const incomingMessage = String(req.body.Body ?? "").trim();
  const from = String(req.body.From ?? "");

  if (!incomingMessage || !from) {
    res.type("text/xml").send("<Response><Message>Send a message to start.</Message></Response>");
    return;
  }

  const { reply } = await handleChatMessage({
    userPhone: from,
    message: incomingMessage
  });

  res.type("text/xml").send(`<Response><Message>${escapeXml(reply)}</Message></Response>`);
});

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
