import express from "express";
import { whatsappRouter } from "./channels/whatsapp.js";
import { webchatRouter } from "./channels/webchat.js";
import { handleChatMessage } from "./logic/chatbotFlow.js";

export const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "offscript",
    version: process.env.RAILWAY_GIT_COMMIT_SHA ?? "local"
  });
});

app.use("/webhooks/whatsapp", whatsappRouter);
app.use("/webhooks/twilio/whatsapp", whatsappRouter);
app.use("/webchat", webchatRouter);

app.post("/chat/test", async (req, res) => {
  const message = String(req.body.message ?? "").trim();
  const userPhone = String(req.body.userPhone ?? "chat:test");

  if (!message) {
    res.status(400).json({ reply: "Send a message to start." });
    return;
  }

  const result = await handleChatMessage({ userPhone, message });
  res.json(result);
});
