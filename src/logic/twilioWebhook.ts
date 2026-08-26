import type { NextFunction, Request, Response } from "express";
import { validateRequest } from "twilio/lib/webhooks/webhooks.js";
import { claimTwilioMessage } from "../data/processedTwilioMessagesRepository.js";
import { getOrCreateWhatsAppUser } from "../data/whatsappUsersRepository.js";
import { preprocessSourceMessage } from "./sourceToken.js";

type InboundPreparationDependencies = {
  claimMessage?: (messageSid: string, userPhone?: string) => Promise<boolean>;
  ensureUser?: (userPhone: string) => Promise<unknown>;
  preprocessMessage?: (userPhone: string, message: string) => Promise<{ message: string }>;
};

export async function prepareInboundWhatsAppMessage(
  input: { messageSid: string; userPhone: string; message: string },
  dependencies: InboundPreparationDependencies = {}
): Promise<{ duplicate: boolean; message: string }> {
  const claimMessage = dependencies.claimMessage ?? claimTwilioMessage;
  const ensureUser = dependencies.ensureUser ?? getOrCreateWhatsAppUser;
  const preprocessMessage = dependencies.preprocessMessage ?? preprocessSourceMessage;

  const claimed = await claimMessage(input.messageSid, input.userPhone);
  if (!claimed) return { duplicate: true, message: input.message };

  await ensureUser(input.userPhone);
  const preprocessed = await preprocessMessage(input.userPhone, input.message);
  return { duplicate: false, message: preprocessed.message };
}

function configuredWebhookUrl(req: Request): string | null {
  const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL?.trim();
  if (!baseUrl) return null;

  try {
    return new URL(req.originalUrl, `${baseUrl.replace(/\/$/, "")}/`).toString();
  } catch {
    return null;
  }
}

export function isValidTwilioWebhook(req: Request): boolean | null {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.header("x-twilio-signature");
  const webhookUrl = configuredWebhookUrl(req);

  if (!authToken || !webhookUrl) return null;
  if (!signature) return false;

  const body = req.body && typeof req.body === "object"
    ? req.body as Record<string, unknown>
    : {};
  const parameters = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map(String) : String(value ?? "")
    ])
  ) as Record<string, string | string[]>;

  return validateRequest(authToken, signature, webhookUrl, parameters);
}

export function validateTwilioWebhook(req: Request, res: Response, next: NextFunction): void {
  const valid = isValidTwilioWebhook(req);

  if (valid === null) {
    console.error("Twilio webhook validation is not configured. Set TWILIO_AUTH_TOKEN and TWILIO_WEBHOOK_BASE_URL.");
    res.status(503).send("WhatsApp webhook validation is not configured.");
    return;
  }

  if (!valid) {
    res.status(403).send("Invalid Twilio webhook signature.");
    return;
  }

  next();
}
