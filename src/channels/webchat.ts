import { Router } from "express";
import { runChatbotFlow } from "../logic/chatbotFlow.js";
import { stagingChatAccess } from "../middleware/stagingChat.js";

export const webchatRouter = Router();

webchatRouter.post("/", ...stagingChatAccess, async (req, res) => {
  const message = String(req.body.message ?? "").trim();
  const userPhone = String(res.locals.testUserPhone);

  if (!message) {
    res.status(400).json({ message: "Send a message to start." });
    return;
  }

  const result = await runChatbotFlow(userPhone, message);
  res.json(result);
});
