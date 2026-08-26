import { readFile } from "node:fs/promises";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks.js";
import { handleSourceRedirect } from "../src/logic/sourceRedirectHandler.js";
import {
  isValidTwilioWebhook,
  prepareInboundWhatsAppMessage
} from "../src/logic/twilioWebhook.js";
import { buildSourceWhatsAppUrl } from "../src/logic/sourceRedirect.js";
import { parseSourceToken, preprocessSourceMessage } from "../src/logic/sourceToken.js";
import { pool } from "../src/integrations/postgres.js";
import type { AcquisitionSource } from "../src/types/source.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const sourceA: AcquisitionSource = {
  id: "00000000-0000-0000-0000-000000000001",
  code: "ABC123",
  slug: "villa-ngor",
  sourceType: "accommodation",
  name: "Villa Ngor",
  homeNeighbourhood: "Ngor",
  active: true,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
};
const sourceB: AcquisitionSource = {
  ...sourceA,
  id: "00000000-0000-0000-0000-000000000002",
  code: "XYZ789",
  slug: "plateau-house",
  name: "Plateau House",
  homeNeighbourhood: "Plateau"
};

const parsedStart = parseSourceToken("Start TUUTI · SRC:ABC123");
assert(parsedStart.sourceCode === "ABC123", "A valid source token must be detected.");
assert(parsedStart.message === "Start OFFSCRIPT", "A source-only launch must enter the existing start flow.");

const parsedQuestion = parseSourceToken("Start TUUTI · SRC:ABC123 I want seafood tonight");
assert(parsedQuestion.message === "I want seafood tonight", "The user's message after a source token must be preserved.");
assert(parseSourceToken("I want seafood tonight").message === "I want seafood tonight", "A normal message must remain unchanged.");

let acquisitionSourceId: string | undefined;
const applyFirstTouch = async (_userPhone: string, source: AcquisitionSource) => {
  acquisitionSourceId ??= source.id;
};
await preprocessSourceMessage("whatsapp:+1000", "Start TUUTI · SRC:ABC123", {
  findSourceByCode: async (code) => code === sourceA.code ? sourceA : null,
  applyFirstTouch
});
await preprocessSourceMessage("whatsapp:+1000", "Start TUUTI · SRC:XYZ789", {
  findSourceByCode: async (code) => code === sourceB.code ? sourceB : null,
  applyFirstTouch
});
assert(acquisitionSourceId === sourceA.id, "A later QR scan must not overwrite first-touch acquisition.");

let invalidTokenApplied = false;
const invalidResult = await preprocessSourceMessage("whatsapp:+1000", "Start TUUTI · SRC:UNKNOWN hello", {
  findSourceByCode: async () => null,
  applyFirstTouch: async () => { invalidTokenApplied = true; }
});
assert(!invalidTokenApplied, "An unknown source token must not set acquisition.");
assert(invalidResult.message === "hello", "An invalid machine token must not leak into chatbot intent parsing.");
console.log("Source token and first-touch checks passed.");

const claimed = new Set<string>();
let chatbotPreparations = 0;
const preparationDependencies = {
  claimMessage: async (sid: string) => {
    if (claimed.has(sid)) return false;
    claimed.add(sid);
    return true;
  },
  ensureUser: async () => undefined,
  preprocessMessage: async (_phone: string, message: string) => {
    chatbotPreparations += 1;
    return { message };
  }
};
const firstDelivery = await prepareInboundWhatsAppMessage(
  { messageSid: "SM123", userPhone: "whatsapp:+1000", message: "Hello" },
  preparationDependencies
);
const retryDelivery = await prepareInboundWhatsAppMessage(
  { messageSid: "SM123", userPhone: "whatsapp:+1000", message: "Hello" },
  preparationDependencies
);
assert(!firstDelivery.duplicate && retryDelivery.duplicate, "A repeated MessageSid must be identified as a duplicate.");
assert(chatbotPreparations === 1, "The same MessageSid must enter message preprocessing only once.");
assert(firstDelivery.message === "Hello", "A normal source-free WhatsApp message must remain unchanged.");
console.log("MessageSid idempotency check passed.");

const previousAuthToken = process.env.TWILIO_AUTH_TOKEN;
const previousWebhookBaseUrl = process.env.TWILIO_WEBHOOK_BASE_URL;
try {
  process.env.TWILIO_AUTH_TOKEN = "test_auth_token";
  process.env.TWILIO_WEBHOOK_BASE_URL = "https://example.test";
  const body = { Body: "Hello", From: "whatsapp:+1000", MessageSid: "SMVALID" };
  const url = "https://example.test/webhooks/whatsapp";
  const validSignature = getExpectedTwilioSignature("test_auth_token", url, body);
  const request = {
    originalUrl: "/webhooks/whatsapp",
    body,
    header: (name: string) => name.toLowerCase() === "x-twilio-signature" ? validSignature : undefined
  } as never;
  assert(isValidTwilioWebhook(request) === true, "A valid Twilio signature must be accepted.");
  const invalidRequest = { ...request, header: () => "invalid" } as never;
  assert(isValidTwilioWebhook(invalidRequest) === false, "An invalid Twilio signature must be rejected.");
} finally {
  if (previousAuthToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
  else process.env.TWILIO_AUTH_TOKEN = previousAuthToken;
  if (previousWebhookBaseUrl === undefined) delete process.env.TWILIO_WEBHOOK_BASE_URL;
  else process.env.TWILIO_WEBHOOK_BASE_URL = previousWebhookBaseUrl;
}
console.log("Twilio signature checks passed.");

const deepLink = buildSourceWhatsAppUrl(sourceA, "whatsapp:+221771234567");
assert(
  deepLink === "https://wa.me/221771234567?text=Start%20TUUTI%20%C2%B7%20SRC%3AABC123",
  "The source deep link must target the configured number with an encoded source token."
);

async function redirectStatus(slug: string): Promise<{ status: number; location?: string }> {
  const result: { status: number; location?: string } = { status: 200 };
  const response = {
    status(code: number) {
      result.status = code;
      return this;
    },
    send() {
      return this;
    },
    redirect(code: number, location: string) {
      result.status = code;
      result.location = location;
    }
  };

  await handleSourceRedirect(
    { params: { slug } },
    response,
    {
      findSourceBySlug: async (candidateSlug) => {
        if (candidateSlug === sourceA.slug) return sourceA;
        if (candidateSlug === "inactive") return { ...sourceA, active: false };
        return null;
      },
      buildWhatsAppUrl: (source) => buildSourceWhatsAppUrl(source, "whatsapp:+221771234567")
    }
  );
  return result;
}

const validRedirect = await redirectStatus("villa-ngor");
assert(validRedirect.status === 302, "A valid active source must redirect.");
assert(validRedirect.location === deepLink, "The redirect must use the source-specific WhatsApp URL.");
assert((await redirectStatus("unknown")).status === 404, "An unknown source must fail safely.");
assert((await redirectStatus("inactive")).status === 404, "An inactive source must fail safely.");
console.log("Source redirect checks passed.");

const migration = await readFile(new URL("../migrations/048_sources_whatsapp_acquisition.sql", import.meta.url), "utf8");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.whatsapp_users"), "Acquisition must live outside conversation_context.");
assert(!migration.includes("ALTER TABLE public.conversation_context"), "The source foundation must not alter conversation context.");
const chatbotFlow = await readFile(new URL("../src/logic/chatbotFlow.ts", import.meta.url), "utf8");
assert(!chatbotFlow.includes("deleteWhatsAppUser"), "Conversation reset must not delete persistent WhatsApp acquisition.");
const whatsappUsersRepository = await readFile(new URL("../src/data/whatsappUsersRepository.ts", import.meta.url), "utf8");
assert(
  whatsappUsersRepository.includes("public.whatsapp_users.acquisition_source_id IS NULL"),
  "First-touch acquisition must only fill an empty acquisition source."
);

console.log("Source tracking foundation checks passed.");
await pool.end();
