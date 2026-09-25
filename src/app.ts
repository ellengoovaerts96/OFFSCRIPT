import express from "express";
import { inboxRouter } from "./channels/inbox.js";
import { whatsappRouter } from "./channels/whatsapp.js";
import { sourceRedirectRouter } from "./channels/sourceRedirect.js";
import { sourcesAdminRouter } from "./channels/sourcesAdmin.js";

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
app.use("/go", sourceRedirectRouter);
app.use("/admin/sources", sourcesAdminRouter);
app.use(inboxRouter);
