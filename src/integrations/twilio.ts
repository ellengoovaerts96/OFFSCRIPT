import twilio from "twilio";

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_FROM;

export function whatsappAddress(value: string): string {
  const number = value.trim().replace(/^whatsapp:/i, "").replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{6,14}$/.test(number)) {
    throw new Error("Invalid WhatsApp address: use an international phone number.");
  }
  return `whatsapp:${number}`;
}

export function canSendWhatsAppMessage(fromOverride?: string): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (twilioWhatsAppFrom || fromOverride));
}

export async function sendWhatsAppMessage(
  to: string,
  body?: string,
  mediaUrl?: string[],
  fromOverride?: string,
  persistentAction?: string[],
  waitForDelivery = false
): Promise<void> {
  const from = fromOverride?.trim() || twilioWhatsAppFrom?.trim();

  if (!from) {
    throw new Error("TWILIO_WHATSAPP_FROM is not configured and no webhook To number was available.");
  }

  const message = await twilioClient.messages.create({
    from: whatsappAddress(from),
    to: whatsappAddress(to),
    ...(body ? { body } : {}),
    ...(mediaUrl?.length ? { mediaUrl } : {}),
    ...(persistentAction?.length ? { persistentAction } : {})
  });
  if (waitForDelivery) await waitForWhatsAppDelivery(message.sid, message.status);
}

async function waitForWhatsAppDelivery(sid: string, initialStatus: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const delivered = async () => {
    let status = initialStatus;
    while (!expired) {
      if (status === "delivered" || status === "read") return;
      if (["failed", "undelivered", "canceled"].includes(status)) {
        throw new Error(`WhatsApp message ${sid} was ${status}; stopping the remaining messages.`);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      if (expired) return;
      status = (await twilioClient.messages(sid).fetch()).status;
    }
  };
  try {
    await Promise.race([
      delivered(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error(`WhatsApp delivery confirmation timed out for ${sid}; stopping the remaining messages.`));
        }, 60_000);
      })
    ]);
  } finally {
    expired = true;
    if (timer) clearTimeout(timer);
  }
}
