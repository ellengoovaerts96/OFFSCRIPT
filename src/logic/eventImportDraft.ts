import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { EventContext, EventSource, ExtractedEvent } from "./eventImport.js";

export type EventDraft = { id: string; expiresAt: number; source: EventSource | null; extraction: ExtractedEvent | null; context: EventContext };
function secret(): string {
  const value = process.env.INBOX_PASSWORD;
  if (!value) throw new Error("Admin access is not configured.");
  return value;
}
export function newEventDraft(): EventDraft {
  return { id: randomUUID(), expiresAt: Date.now() + 24 * 60 * 60 * 1000, source: null, extraction: null,
    context: { month: null, year: null, publicationDate: null } };
}
export function signEventDraft(draft: EventDraft): string {
  const payload = Buffer.from(JSON.stringify(draft)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(`event-import:${payload}`).digest("base64url")}`;
}
export function readEventDraft(token: unknown): EventDraft {
  if (typeof token !== "string" || token.length > 75000) throw new Error("Invalid import review. Upload the screenshot again.");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid import review.");
  const [payload, signature] = parts;
  const expected = createHmac("sha256", secret()).update(`event-import:${payload}`).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("The source verification data has changed. Upload the screenshot again.");
  const draft = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as EventDraft;
  if (!draft.id || !Number.isFinite(draft.expiresAt) || draft.expiresAt < Date.now()) throw new Error("This import review expired after 24 hours. Upload the screenshot again.");
  return draft;
}
