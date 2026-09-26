import { Router } from "express";
import { detectLanguage } from "../ai/detectLanguage.js";
import { createChatMessage } from "../data/chatMessagesRepository.js";
import { canSendWhatsAppMessage, sendWhatsAppMessage } from "../integrations/twilio.js";
import { handleChatMessage } from "../logic/chatbotFlow.js";
import {
  prepareInboundWhatsAppMessage,
  validateTwilioWebhook
} from "../logic/twilioWebhook.js";
import { locationActionLabel } from "../logic/recommendationLinks.js";

export const whatsappRouter = Router();
const WEBHOOK_RESPONSE_DEADLINE_MS = 10_000;
const DELAYED_PROCESSING_DEADLINE_MS = 35_000;

type ChatbotMessageResult = Awaited<ReturnType<typeof handleChatMessage>>;

whatsappRouter.post("/", validateTwilioWebhook, async (req, res) => {
  try {
    const rawIncomingMessage = String(req.body.Body ?? "").trim();
    const from = String(req.body.From ?? "");
    const twilioTo = String(req.body.To ?? "");
    const messageSid = String(req.body.MessageSid ?? "").trim();

    if (!rawIncomingMessage || !from || !messageSid) {
      sendTwilioMessages(res, ["Send a message to start."]);
      return;
    }

    // Include deduplication and user/source preparation in the response deadline:
    // these also access Postgres and can stall before recommendation processing.
    const processing = (async () => {
      const prepared = await prepareInboundWhatsAppMessage({
        messageSid,
        userPhone: from,
        message: rawIncomingMessage
      });
      if (prepared.duplicate) return { duplicate: true as const };

      void logChatMessage(from, "incoming", prepared.message);
      const result = await handleChatMessage({
        userPhone: from,
        message: prepared.message
      });
      return { duplicate: false as const, result };
    })();
    const result = await withinWebhookDeadline(processing);

    if (!result) {
      const acknowledgement = buildProcessingAcknowledgement(rawIncomingMessage);
      sendTwilioMessages(res, [acknowledgement]);
      void logChatMessage(from, "outgoing", acknowledgement);

      if (canSendWhatsAppMessage(twilioTo)) {
        void withinDelayedProcessingDeadline(processing)
          .then((completed) => completed.duplicate ? undefined : sendCompletedResult(from, twilioTo, completed.result))
          .catch((error) => sendDelayedFailure(from, twilioTo, rawIncomingMessage, error));
      } else {
        console.error("WhatsApp processing exceeded the webhook deadline and delayed sending is unavailable.");
      }
      return;
    }

    if (result.duplicate) {
      sendTwilioMessages(res, []);
      return;
    }

    if ((result.result.contactMessages?.length || result.result.locationActions.length) && canSendWhatsAppMessage(twilioTo)) {
      // A single TwiML response queues all messages together. Use the REST
      // delivery path so information is delivered before contact details.
      sendTwilioMessages(res, []);
      void sendCompletedResult(from, twilioTo, result.result);
      return;
    }

    const { reply, followUpMessages, contactMessages = [], locationActions, imageUrls, videoUrls, afterMediaMessages } = result.result;

    void logChatMessage(from, "outgoing", reply);

    for (const outgoingMessage of [...followUpMessages, ...contactMessages, ...afterMediaMessages]) {
      void logChatMessage(from, "outgoing", outgoingMessage);
    }

    // Keep every text message below WhatsApp's size limit and include all
    // content in one ordered TwiML response: text -> photos -> video.
    sendTwilioMessages(
      res,
      [...buildRecommendationTextMessages(reply, followUpMessages), ...contactMessages],
      imageUrls,
      videoUrls,
      afterMediaMessages
    );
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
    const informationMessages = buildRecommendationTextMessages(result.reply, result.followUpMessages);
    const contactMessages = result.contactMessages ?? [];
    const textMessages = [...informationMessages, ...contactMessages];
    for (const text of textMessages) {
      await sendWhatsAppMessage(to, text, undefined, fromOverride, undefined, contactMessages.length > 0);
      void logChatMessage(to, "outgoing", text);
    }
    await sendRecommendationFollowUps(
      to,
      fromOverride,
      [],
      result.locationActions,
      result.imageUrls,
      result.videoUrls,
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
  videoUrls: string[] = [],
  afterMediaMessages: string[] = []
): void {
  const textMessages = messages.map((message) => `<Message><Body>${escapeXml(message)}</Body></Message>`).join("");
  const mediaMessages = imageUrls
    .map((url) => `<Message><Media>${escapeXml(url)}</Media></Message>`)
    .join("");
  const videoMessages = videoUrls
    .map((url) => `<Message><Media>${escapeXml(url)}</Media></Message>`)
    .join("");
  const afterMediaTextMessages = afterMediaMessages
    .map((message) => `<Message><Body>${escapeXml(message)}</Body></Message>`)
    .join("");

  res.type("text/xml").send(`<Response>${textMessages}${mediaMessages}${videoMessages}${afterMediaTextMessages}</Response>`);
}

function buildRecommendationTextMessages(reply: string, followUpMessages: string[]): string[] {
  const sections = [reply, ...followUpMessages].filter(Boolean);
  const messages: string[] = [];
  const maximumLength = 1400;

  for (const section of sections) {
    const previous = messages.at(-1);
    const combined = previous ? `${previous}\n\n${section}` : section;

    if (previous && combined.length <= maximumLength) {
      messages[messages.length - 1] = combined;
    } else if (section.length <= maximumLength) {
      messages.push(section);
    } else {
      for (let start = 0; start < section.length; start += maximumLength) {
        messages.push(section.slice(start, start + maximumLength));
      }
    }
  }

  return messages;
}

async function sendRecommendationFollowUps(
  to: string,
  fromOverride: string,
  followUpMessages: string[],
  locationActions: string[],
  imageUrls: string[],
  videoUrls: string[],
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

  for (const imageUrl of imageUrls) {
    await sendWhatsAppMediaWithRetry(to, fromOverride, imageUrl);
    // WhatsApp media messages are sent separately. A larger interval prevents
    // the third image from being dropped by transient sender throttling.
    await wait(2000);
  }

  if (imageUrls.length || videoUrls.length) {
    await wait(1500);
  }

  for (const videoUrl of videoUrls) {
    await sendWhatsAppMediaWithRetry(to, fromOverride, videoUrl, "video");
    await wait(2000);
  }

  for (const locationAction of locationActions) {
    try {
      await sendWhatsAppMessage(to, locationActionLabel(locationAction), undefined, fromOverride, [locationAction]);
      await wait(800);
    } catch (error) {
      console.error("Could not send delayed WhatsApp location", error);
    }
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
  mediaUrl: string,
  mediaKind: "photo" | "video" = "photo"
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await sendWhatsAppMessage(to, undefined, [mediaUrl], fromOverride);
      return;
    } catch (error) {
      console.error(`Could not send delayed WhatsApp ${mediaKind} (attempt ${attempt})`, error);
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
