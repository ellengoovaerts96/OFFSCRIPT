import { Router } from "express";
import { detectLanguage } from "../ai/detectLanguage.js";
import { createChatMessage } from "../data/chatMessagesRepository.js";
import { canSendWhatsAppMessage, sendWhatsAppMessage } from "../integrations/twilio.js";
import { handleChatMessage } from "../logic/chatbotFlow.js";

export const whatsappRouter = Router();
const WEBHOOK_RESPONSE_DEADLINE_MS = 10_000;
const DELAYED_PROCESSING_DEADLINE_MS = 35_000;

type ChatbotMessageResult = Awaited<ReturnType<typeof handleChatMessage>>;

whatsappRouter.post("/", async (req, res) => {
  try {
    const incomingMessage = String(req.body.Body ?? "").trim();
    const from = String(req.body.From ?? "");
    const twilioTo = String(req.body.To ?? "");

    if (!incomingMessage || !from) {
      sendTwilioMessages(res, ["Send a message to start."]);
      return;
    }

    // Logging must never delay the Twilio webhook response. Railway/Postgres
    // can briefly be slow even while recommendation processing is healthy.
    void logChatMessage(from, "incoming", incomingMessage);

    const processing = handleChatMessage({
      userPhone: from,
      message: incomingMessage
    });
    const result = await withinWebhookDeadline(processing);

    if (!result) {
      const acknowledgement = buildProcessingAcknowledgement(incomingMessage);
      sendTwilioMessages(res, [acknowledgement]);
      void logChatMessage(from, "outgoing", acknowledgement);

      if (canSendWhatsAppMessage(twilioTo)) {
        void withinDelayedProcessingDeadline(processing)
          .then((completedResult) => sendCompletedResult(from, twilioTo, completedResult))
          .catch((error) => sendDelayedFailure(from, twilioTo, incomingMessage, error));
      } else {
        console.error("WhatsApp processing exceeded the webhook deadline and delayed sending is unavailable.");
      }
      return;
    }

    const { reply, followUpMessages, locationActions, imageUrls, afterMediaMessages } = result;

    void logChatMessage(from, "outgoing", reply);

    if (canSendWhatsAppMessage(twilioTo)) {
      sendTwilioMessages(res, [reply]);
      scheduleRecommendationFollowUps(from, twilioTo, followUpMessages, locationActions, imageUrls, afterMediaMessages);
      return;
    }

    if (followUpMessages.length || locationActions.length || imageUrls.length || afterMediaMessages.length) {
      console.error(
        "Delayed WhatsApp recommendation follow-ups are unavailable. Falling back to one combined description and Maps message."
      );
    }

    for (const outgoingMessage of [...followUpMessages, ...afterMediaMessages]) {
      void logChatMessage(from, "outgoing", outgoingMessage);
    }

    sendTwilioMessages(res, buildFallbackMessages(reply, followUpMessages), imageUrls, afterMediaMessages);
  } catch (error) {
    console.error("WhatsApp webhook failed", error);
    sendTwilioMessages(res, ["OFFSCRIPT had a small hiccup. Try again in a moment."]);
  }
});

async function withinWebhookDeadline<T>(promise: Promise<T>): Promise<T | null> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), WEBHOOK_RESPONSE_DEADLINE_MS);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function withinDelayedProcessingDeadline<T>(promise: Promise<T>): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error(
              `WhatsApp recommendation processing exceeded the ${DELAYED_PROCESSING_DEADLINE_MS}ms delayed deadline.`
            )
          );
        }, DELAYED_PROCESSING_DEADLINE_MS);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function sendCompletedResult(
  to: string,
  fromOverride: string,
  result: ChatbotMessageResult
): Promise<void> {
  try {
    await sendWhatsAppMessage(to, result.reply, undefined, fromOverride);
    await logChatMessage(to, "outgoing", result.reply);
    await sendRecommendationFollowUps(
      to,
      fromOverride,
      result.followUpMessages,
      result.locationActions,
      result.imageUrls,
      result.afterMediaMessages
    );
  } catch (error) {
    console.error("Could not deliver completed delayed WhatsApp result", error);
  }
}

async function sendDelayedFailure(
  to: string,
  fromOverride: string,
  incomingMessage: string,
  error: unknown
): Promise<void> {
  console.error("Delayed WhatsApp processing failed", error);
  const failureMessage = buildDelayedFailureMessage(incomingMessage);

  try {
    await sendWhatsAppMessage(to, failureMessage, undefined, fromOverride);
    await logChatMessage(to, "outgoing", failureMessage);
  } catch (sendError) {
    console.error("Could not send delayed WhatsApp failure message", sendError);
  }
}

function buildProcessingAcknowledgement(message: string): string {
  const language = detectLanguage(message, "fr");

  if (language === "nl") return "Eén moment, ik zoek dit even goed voor je uit…";
  if (language === "de") return "Einen Moment, ich schaue das kurz sorgfältig für dich nach…";
  if (language === "en") return "One moment — I’m checking this properly for you…";
  return "Un instant — je vérifie ça correctement pour toi…";
}

function buildDelayedFailureMessage(message: string): string {
  const language = detectLanguage(message, "fr");

  if (language === "nl") return "Sorry, het opzoeken lukte deze keer niet. Probeer je bericht nog één keer.";
  if (language === "de") return "Entschuldigung, die Suche hat diesmal nicht geklappt. Schick deine Nachricht bitte noch einmal.";
  if (language === "en") return "Sorry, the search did not complete this time. Please send your message once more.";
  return "Désolé, la recherche n’a pas abouti cette fois. Envoie ton message encore une fois.";
}

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
  imageUrls: string[] = [],
  afterMediaMessages: string[] = []
): void {
  const textMessages = messages.map((message) => `<Message><Body>${escapeXml(message)}</Body></Message>`).join("");
  const mediaMessages = imageUrls
    .map((url) => `<Message><Media>${escapeXml(url)}</Media></Message>`)
    .join("");
  const afterMediaTextMessages = afterMediaMessages
    .map((message) => `<Message><Body>${escapeXml(message)}</Body></Message>`)
    .join("");

  res.type("text/xml").send(`<Response>${textMessages}${mediaMessages}${afterMediaTextMessages}</Response>`);
}

function buildFallbackMessages(reply: string, followUpMessages: string[]): string[] {
  if (!followUpMessages.length) return [reply];

  return [`${reply}\n\n${followUpMessages.join("\n\n")}`];
}

function scheduleRecommendationFollowUps(
  to: string,
  fromOverride: string,
  followUpMessages: string[],
  locationActions: string[],
  imageUrls: string[],
  afterMediaMessages: string[]
): void {
  if (!followUpMessages.length && !locationActions.length && !imageUrls.length && !afterMediaMessages.length) return;

  setTimeout(() => {
    void sendRecommendationFollowUps(to, fromOverride, followUpMessages, locationActions, imageUrls, afterMediaMessages);
  }, 1500);
}

async function sendRecommendationFollowUps(
  to: string,
  fromOverride: string,
  followUpMessages: string[],
  locationActions: string[],
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

  for (const locationAction of locationActions) {
    try {
      await sendWhatsAppMessage(to, undefined, undefined, fromOverride, [locationAction]);
      await wait(800);
    } catch (error) {
      console.error("Could not send delayed WhatsApp location", error);
    }
  }

  for (const imageUrl of imageUrls) {
    await sendWhatsAppMediaWithRetry(to, fromOverride, imageUrl);
    // WhatsApp media messages are sent separately. A larger interval prevents
    // the third image from being dropped by transient sender throttling.
    await wait(2000);
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

async function sendWhatsAppMediaWithRetry(
  to: string,
  fromOverride: string,
  imageUrl: string
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await sendWhatsAppMessage(to, undefined, [imageUrl], fromOverride);
      return;
    } catch (error) {
      console.error(`Could not send delayed WhatsApp media (attempt ${attempt})`, error);
      if (attempt < 3) await wait(2500);
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
