import express from "express";
import { whatsappRouter } from "./channels/whatsapp.js";
import { webchatRouter } from "./channels/webchat.js";

export const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "offscript" });
});

app.use("/webhooks/whatsapp", whatsappRouter);
app.use("/webchat", webchatRouter);
