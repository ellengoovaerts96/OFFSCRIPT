import { detectLanguage } from "./detectLanguage.js";
import { getOpenAIClient, hasOpenAIKey, openaiModel } from "../integrations/openai.js";
import type { Response } from "openai/resources/responses/responses";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const EVENT_SEARCH_TIMEOUT_MS = 6_500;
const DAKAR_TIME_ZONE = "Africa/Dakar";

type DateRange = {
  start: string;
  end: string;
  kind: "week" | "weekend";
};

export type CuratedEventVenue = {
  name: string;
  area?: string;
};

const currentEventSchema = z.object({
  found: z.boolean(),
  name: z.string().nullable(),
  date: z.string().nullable(),
  startTime: z.string().nullable(),
  venue: z.string().nullable(),
  reason: z.string().nullable(),
  sourceUrl: z.string().nullable()
});

function dakarDate(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DAKAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function currentEventDateRange(message: string, now = new Date()): DateRange {
  const today = dakarDate(now);
  const lower = message.toLowerCase();
  const asksWeekend = /week[ -]?end|weekend/.test(lower);
  const asksNext = /\b(next|volgend|volgende|prochain|kommend|nächst)\w*\b/i.test(lower);

  if (asksWeekend) {
    const weekday = today.getUTCDay();
    const daysUntilSaturday = weekday === 0 ? -1 : weekday === 6 ? 0 : 6 - weekday;
    const start = addDays(today, daysUntilSaturday + (asksNext ? 7 : 0));
    return { start: isoDate(start), end: isoDate(addDays(start, 1)), kind: "weekend" };
  }

  const weekday = today.getUTCDay() || 7;
  const start = addDays(today, 1 - weekday + (asksNext ? 7 : 0));
  return { start: isoDate(start), end: isoDate(addDays(start, 6)), kind: "week" };
}

export function isCurrentEventRequest(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const hasCurrentPeriod = /\b(deze week|dit weekend|volgende week|volgend weekend|this week|this weekend|next week|next weekend|cette semaine|ce weekend|ce week end|weekend prochain|semaine prochaine|diese woche|dieses wochenende|nachste woche|nachstes wochenende)\b/.test(normalized);
  const asksWhatIsOn = /\b(wat.*te doen|wat is er|evenement|event|agenda|concert|festival|optreden|what.*to do|what is on|events?|things to do|que faire|qu est ce qu il y a|evenements?|sortir|veranstaltungen?|was.*unternehmen|was ist los|konzert|festival)\b/.test(normalized);
  const mentionsDakar = /\bdakar\b/.test(normalized);

  return hasCurrentPeriod && asksWhatIsOn && mentionsDakar;
}

function fallbackMessage(language: string): string {
  if (language === "nl") return "Ik kon nu geen actueel evenement betrouwbaar verifiëren. Probeer het straks nog eens.";
  if (language === "fr") return "Je n’ai pas pu vérifier un événement actuel de façon fiable. Réessaie un peu plus tard.";
  if (language === "de") return "Ich konnte gerade keine aktuelle Veranstaltung zuverlässig bestätigen. Versuch es später noch einmal.";
  return "I couldn’t reliably verify a current event right now. Please try again a little later.";
}

function eventMessage(
  language: string,
  event: z.infer<typeof currentEventSchema>,
  sourceUrl: string,
  curatedVenue?: CuratedEventVenue
): string {
  if (!event.found || !event.name || !event.date || !event.venue) {
    return fallbackMessage(language);
  }

  const time = event.startTime ? ` ${event.startTime}` : "";
  const reason = event.reason?.trim();
  const venue = curatedVenue?.name ?? event.venue;
  if (language === "nl") {
    const personalOpening = curatedVenue
      ? `Ik zou je deze aanraden: ${event.name} bij ${venue}. Die plek hebben we bij OFFSCRIPT zelf gecheckt, dus dat voelt meteen wat vertrouwder.`
      : `Ik zou ${event.name} eens bekijken; die vindt plaats bij ${venue}.`;
    return `${personalOpening} Het is op ${event.date}${time}.${reason ? ` ${reason.replace(/[.!?]+$/, "")}.` : ""} Check voor vertrek nog even of er plaats is.\n\nBron: ${sourceUrl}`;
  }
  if (language === "fr") {
    const personalOpening = curatedVenue
      ? `Je t’enverrais à ${event.name} chez ${venue}. C’est une adresse qu’OFFSCRIPT a vérifiée personnellement, donc je la recommande plus volontiers.`
      : `Je regarderais ${event.name}, qui a lieu chez ${venue}.`;
    return `${personalOpening} C’est le ${event.date}${time}.${reason ? ` ${reason.replace(/[.!?]+$/, "")}.` : ""} Vérifie quand même les disponibilités avant de partir.\n\nSource : ${sourceUrl}`;
  }
  if (language === "de") {
    const personalOpening = curatedVenue
      ? `Ich würde dir ${event.name} bei ${venue} empfehlen. OFFSCRIPT hat diesen Ort persönlich geprüft, deshalb ist er für mich die vertrauenswürdigere Wahl.`
      : `Ich würde mir ${event.name} bei ${venue} ansehen.`;
    return `${personalOpening} Die Veranstaltung ist am ${event.date}${time}.${reason ? ` ${reason.replace(/[.!?]+$/, "")}.` : ""} Prüfe vorab noch kurz die Verfügbarkeit.\n\nQuelle: ${sourceUrl}`;
  }
  const personalOpening = curatedVenue
    ? `I’d send you to ${event.name} at ${venue}. OFFSCRIPT has personally checked this place, so it’s the option I’d trust first.`
    : `I’d take a look at ${event.name}, which is happening at ${venue}.`;
  return `${personalOpening} It’s on ${event.date}${time}.${reason ? ` ${reason.replace(/[.!?]+$/, "")}.` : ""} Check availability before you go.\n\nSource: ${sourceUrl}`;
}

function normalizeVenue(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchingCuratedVenue(
  eventVenue: string,
  curatedVenues: CuratedEventVenue[]
): CuratedEventVenue | undefined {
  const normalizedEventVenue = normalizeVenue(eventVenue);
  return curatedVenues.find((venue) => {
    const normalizedName = normalizeVenue(venue.name);
    return normalizedName.length >= 5 && (
      normalizedEventVenue.includes(normalizedName) ||
      normalizedName.includes(normalizedEventVenue)
    );
  });
}

function citationUrls(response: Response): string[] {
  const urls: string[] = [];
  for (const item of response.output) {
    if (item.type === "web_search_call" && item.action.type === "search") {
      urls.push(...(item.action.sources ?? []).map((source) => source.url));
    }
    if (item.type !== "message") continue;
    for (const content of item.content) {
      if (content.type !== "output_text") continue;
      for (const annotation of content.annotations) {
        if (annotation.type === "url_citation") urls.push(annotation.url);
      }
    }
  }
  return [...new Set(urls)];
}

export async function findCurrentEvent(
  message: string,
  curatedVenues: CuratedEventVenue[] = []
): Promise<string | null> {
  if (!isCurrentEventRequest(message)) return null;

  const language = detectLanguage(message, "fr");
  if (!hasOpenAIKey()) return fallbackMessage(language);

  const range = currentEventDateRange(message);
  const curatedVenueList = curatedVenues.length
    ? curatedVenues.map((venue) => `- ${venue.name}${venue.area ? ` (${venue.area})` : ""}`).join("\n")
    : "- No curated venue list was available.";
  try {
    const response = await getOpenAIClient().responses.parse({
      model: openaiModel,
      tools: [{
        type: "web_search",
        search_context_size: "medium",
        user_location: {
          type: "approximate",
          city: "Dakar",
          country: "SN",
          region: "Dakar",
          timezone: DAKAR_TIME_ZONE
        }
      }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      instructions: `You find current public events for OFFSCRIPT users in Dakar, Senegal.
Search the live web; never answer from memory.
The requested ${range.kind} is exactly ${range.start} through ${range.end}, in Africa/Dakar time.
Search for a qualifying event at the OFFSCRIPT-curated venues below first. These locations were personally checked by OFFSCRIPT:
${curatedVenueList}
Only when none of those venues has a verifiable event in the requested date range may you broaden the search to other Dakar venues.
Return exactly one strong, publicly accessible event that actually takes place within those dates and in Dakar.
The source must explicitly show the event date in the requested range. Reject undated listings, generic recurring calendars, cancelled events, closed registrations and pages for another year.
Return the event name, exact human-readable date, start time when published, venue or neighbourhood, one concise reason it may be interesting, and the direct source URL that verifies it.
Write the reason in the same language as the user. Do not return weather, alternatives, introductions, conclusions or source lists.
Do not invent missing details. Set found to false if no event can be verified from a dated source.`,
      input: message,
      text: {
        format: zodTextFormat(currentEventSchema, "current_dakar_event")
      }
    }, {
      timeout: EVENT_SEARCH_TIMEOUT_MS
    });

    const event = response.output_parsed;
    if (!event) return fallbackMessage(language);
    const searchedUrls = citationUrls(response);
    const sourceUrl = event.sourceUrl && searchedUrls.some((url) => {
      try {
        return new URL(url).hostname === new URL(event.sourceUrl as string).hostname;
      } catch {
        return false;
      }
    }) ? event.sourceUrl : undefined;
    if (!sourceUrl) return fallbackMessage(language);
    return eventMessage(
      language,
      event,
      sourceUrl,
      matchingCuratedVenue(event.venue ?? "", curatedVenues)
    );
  } catch (error) {
    console.error("Current event web search failed", error);
    return fallbackMessage(language);
  }
}
