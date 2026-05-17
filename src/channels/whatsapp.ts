import { Router } from "express";

export const whatsappRouter = Router();

whatsappRouter.post("/", async (req, res) => {
  const incomingMessage = String(req.body.Body ?? "").trim();
  const from = String(req.body.From ?? "");

  console.log("WhatsApp message received", { from, incomingMessage });

  res.type("text/xml").send("<Response><Message>OFFSCRIPT is warming up.</Message></Response>");
});
