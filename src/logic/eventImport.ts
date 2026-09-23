import { z } from "zod";

export const sourceTypes = ["unknown", "instagram", "facebook", "whatsapp", "flyer", "other"] as const;
export const eventFields = ["title", "venueName", "eventDate", "dateText", "startTime", "endTime", "category", "description", "price", "conditions", "reservationRequired", "contactPhone", "instagramAccount", "recurrence", "sourceType"] as const;
const text = z.string().max(3000).nullable();
export const extractedEventSchema = z.object({
  readable: z.boolean(),
  title: text, venueName: text, eventDate: text, dateText: text,
  startTime: text, endTime: text, category: text, description: text,
  price: text, conditions: text,
  reservationRequired: z.enum(["yes", "no", "unknown"]),
  contactPhone: text, instagramAccount: text, recurrence: text,
  sourceType: z.enum(sourceTypes),
  dateBasis: z.enum(["explicit", "provided_context", "unknown"]),
  uncertainFields: z.array(z.object({ field: z.enum(eventFields), note: z.string().max(500) })).max(30)
});
export type ExtractedEvent = z.infer<typeof extractedEventSchema>;
export type EventContext = { month: number | null; year: number | null; publicationDate: string | null };
export type EventVenue = { id: string; name: string; neighbourhood: string | null; area: string | null };
export type EventSource = { originalUrl: string; previewUrl: string; publicId: string; filename: string; format: string };
export type EventData = {
  title: string; venueName: string; placeId: string | null; eventDate: string | null;
  dateText: string; startTime: string | null; endTime: string | null;
  category: string; description: string; price: string; conditions: string;
  reservationRequired: "yes" | "no" | "unknown"; contactPhone: string;
  instagramAccount: string; recurrence: string; sourceType: typeof sourceTypes[number];
  sourceUrl: string; verificationNotes: string;
};
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1900 &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function parseEventContext(body: Record<string, unknown>): EventContext {
  const number = (name: string, min: number, max: number) => {
    const raw = String(body[name] ?? "").trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}.`);
    return value;
  };
  const publicationDate = String(body.publicationDate ?? "").trim() || null;
  if (publicationDate && !validDate(publicationDate)) throw new Error("Invalid publication date.");
  return { month: number("month", 1, 12), year: number("year", 1900, 2200), publicationDate };
}
export function safeSourceUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.length > 2000) throw new Error("Source URL is too long.");
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw new Error("Use a valid http or https source URL."); }
}
export function emptyEvent(): EventData {
  return { title: "", venueName: "", placeId: null, eventDate: null, dateText: "", startTime: null, endTime: null,
    category: "", description: "", price: "", conditions: "", reservationRequired: "unknown", contactPhone: "",
    instagramAccount: "", recurrence: "", sourceType: "unknown", sourceUrl: "", verificationNotes: "" };
}
export function validateEvent(body: Record<string, unknown>): EventData {
  const data = emptyEvent();
  for (const key of Object.keys(data) as Array<keyof EventData>) {
    const raw = body[key];
    if (raw !== undefined && raw !== null && typeof raw !== "string") throw new Error(`Invalid ${key}.`);
    const value = String(raw ?? "").trim();
    if (value.length > (key === "description" || key === "verificationNotes" ? 10000 : 3000)) throw new Error(`${key} is too long.`);
    Object.assign(data, { [key]: value });
  }
  if (!data.title || data.title.length > 300) throw new Error("Enter an event title (maximum 300 characters).");
  if (!["yes", "no", "unknown"].includes(data.reservationRequired)) throw new Error("Invalid reservation choice.");
  if (!sourceTypes.includes(data.sourceType)) throw new Error("Invalid source type.");
  data.sourceUrl = safeSourceUrl(data.sourceUrl);
  data.eventDate = data.eventDate || null;
  if (data.eventDate && !validDate(data.eventDate)) throw new Error("Enter a complete, valid event date or leave it empty.");
  for (const key of ["startTime", "endTime"] as const) {
    data[key] = data[key] || null;
    if (data[key] && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(data[key])) throw new Error(`Invalid ${key}; use HH:MM.`);
  }
  data.placeId = data.placeId || null;
  if (data.placeId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.placeId)) throw new Error("Invalid place selection.");
  return data;
}
export function reviewExtraction(raw: unknown, context: EventContext): ExtractedEvent {
  const data = extractedEventSchema.parse(raw);
  const warn = (field: typeof eventFields[number], note: string) => { data.uncertainFields.push({ field, note }); };
  if (data.eventDate) {
    const literal = (data.dateText ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const explicitYear = /\b(?:19|20|21)\d{2}\b/.test(literal);
    const explicitMonth = /\b(?:jan(?:uary|vier|uari)?|feb(?:ruary|ruari|rier)?|fevrier|mar(?:ch|s)?|maart|apr(?:il)?|avril|may|mai|mei|jun(?:e|i)?|juin|jul(?:y|i)?|juillet|aug(?:ust|ustus)?|aout|sep(?:t(?:ember|embre)?)?|oct(?:ober|obre)?|oktober|nov(?:ember|embre)?|dec(?:ember|embre)?)\b/.test(literal) || /\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/.test(literal);
    const relative = /\b(?:this|next|ce|cette|prochain|prochaine|deze|volgende|tomorrow|demain|morgen|today|aujourd hui|vandaag)\b/.test(literal);
    const hasContext = Boolean(context.publicationDate || (context.month && context.year));
    if (!validDate(data.eventDate) || data.dateBasis === "unknown" || (!(explicitYear && explicitMonth) && !hasContext) ||
        (data.dateBasis === "provided_context" && !hasContext) || (relative && !context.publicationDate)) {
      data.eventDate = null;
      warn("eventDate", "Month/year or date context is insufficient. Confirm the full date manually.");
    } else if (data.dateBasis === "provided_context") {
      warn("eventDate", "Date resolved using your supplied context. Check it against the screenshot.");
    }
  } else if (data.dateText) warn("eventDate", "Only a partial or relative date was found. Confirm month and year.");
  if (data.eventDate && data.dateBasis === "provided_context" &&
      ((context.month && Number(data.eventDate.slice(5, 7)) !== context.month) || (context.year && Number(data.eventDate.slice(0, 4)) !== context.year))) {
    data.eventDate = null; warn("eventDate", "The extracted date conflicts with the supplied month/year. Verify it manually.");
  }
  if (data.eventDate && data.dateText) {
    const weekdays = [/\b(sunday|dimanche|zondag)\b/i, /\b(monday|lundi|maandag)\b/i, /\b(tuesday|mardi|dinsdag)\b/i, /\b(wednesday|mercredi|woensdag)\b/i, /\b(thursday|jeudi|donderdag)\b/i, /\b(friday|vendredi|vrijdag)\b/i, /\b(saturday|samedi|zaterdag)\b/i];
    const weekday = weekdays.findIndex(pattern => pattern.test(data.dateText ?? ""));
    if (weekday >= 0 && weekday !== new Date(`${data.eventDate}T12:00:00Z`).getUTCDay()) {
      data.eventDate = null; warn("eventDate", "The weekday does not match the calendar date. Check month and year.");
    }
  }
  for (const field of ["startTime", "endTime"] as const) {
    if (data[field] && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(data[field])) {
      data[field] = null; warn(field, "Time could not be reliably interpreted.");
    }
  }
  if (!data.readable) throw new Error("No readable event information was found. Try a clearer screenshot or enter the event manually.");
  return data;
}
const normalizedName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function matchEventVenue(name: string | null, venues: EventVenue[]): { exact: EventVenue | null; suggestions: EventVenue[] } {
  const query = normalizedName(name ?? "");
  if (!query) return { exact: null, suggestions: [] };
  const exact = venues.filter(venue => normalizedName(venue.name) === query);
  if (exact.length === 1) return { exact: exact[0], suggestions: exact };
  const suggestions = exact.length ? exact : venues.filter(venue => {
    const candidate = normalizedName(venue.name);
    return query.length >= 3 && (candidate.includes(query) || query.includes(candidate));
  });
  return { exact: null, suggestions: suggestions.slice(0, 8) };
}
export function extractionToEvent(extracted: ExtractedEvent, sourceUrl: string): EventData {
  const data = emptyEvent();
  for (const field of eventFields) Object.assign(data, { [field]: extracted[field] ?? data[field] });
  data.sourceUrl = sourceUrl;
  return data;
}
export function screenshotFormat(buffer: Buffer): "png" | "jpg" | "heic" {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "png";
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return "jpg";
  if (buffer.length >= 16 && buffer.toString("ascii", 4, 8) === "ftyp" && /heic|heix|hevc|hevx|mif1|msf1/.test(buffer.toString("ascii", 8, Math.min(buffer.length, 64)))) return "heic";
  throw new Error("Upload a PNG, JPG or HEIC screenshot. This file is not a supported image.");
}
