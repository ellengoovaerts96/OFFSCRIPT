import type { EventData } from './eventImport.js';

export const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Suggest a weekly schedule only from explicit recurrence wording, never a single weekday/date. */
export function inferWeeklyWeekday(text: string): string | null {
  const value = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(biweekly|fortnight|other|alternate|alternating|twee|deux|two|om de|oneven|even weken|monthly|mensuel|maandelijks)\b/.test(value) || /\b(?:2|3|4)\s*(?:weeks?|semaines?|weken)\b/.test(value)) return null;
  const days = [
    /\b(sundays?|dimanches?|zondagen|zondag)\b/, /\b(mondays?|lundis?|maandagen|maandag)\b/,
    /\b(tuesdays?|mardis?|dinsdagen|dinsdag)\b/, /\b(wednesdays?|mercredis?|woensdagen|woensdag)\b/,
    /\b(thursdays?|jeudis?|donderdagen|donderdag)\b/, /\b(fridays?|vendredis?|vrijdagen|vrijdag)\b/,
    /\b(saturdays?|samedis?|zaterdagen|zaterdag)\b/
  ];
  const matches = days.map((pattern, day) => pattern.test(value) ? day : -1).filter(day => day >= 0);
  const explicit = /\b(every|each|weekly|elke|iedere|wekelijks|tous les|chaque|hebdomadaire|sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|lundis|mardis|mercredis|jeudis|vendredis|samedis|dimanches)\b/.test(value);
  return explicit && matches.length === 1 ? String(matches[0]) : null;
}

/** A date range alone does not prove that an event opens every day. */
export function inferDailyRecurrence(text: string): boolean {
  const value = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\b(daily|every day|each day|dagelijks|elke dag|iedere dag|tous les jours|chaque jour|quotidien|taglich|jeden tag)\b/.test(value) &&
    !/\b(except|excluding|closed|sauf|ferme|behalve|gesloten|ausser|geschlossen|weekdays|werkdagen)\b/.test(value);
}

/** Expand a reviewed daily or weekly series into actual dates in a bounded request window (Dakar/UTC). */
export function eventOccurrences(event: EventData, start: string, end: string, today: string): EventData[] {
  if (!event.eventDate || event.status !== 'published') return [];
  const lower = [start, today, event.eventDate].sort().at(-1)!;
  const upper = event.recurrenceFrequency !== 'none' && event.recurrenceUntil && event.recurrenceUntil < end ? event.recurrenceUntil : end;
  if (lower > upper) return [];
  if (event.recurrenceFrequency !== 'weekly' && event.recurrenceFrequency !== 'daily') return event.eventDate >= lower && event.eventDate <= upper ? [event] : [];
  if (event.recurrenceFrequency === 'weekly' && !/^[0-6]$/.test(event.recurrenceWeekday ?? '')) return [];
  const first = new Date(`${lower}T00:00:00Z`);
  if (!Number.isFinite(first.getTime())) return [];
  if (event.recurrenceFrequency === 'weekly') first.setUTCDate(first.getUTCDate() + (Number(event.recurrenceWeekday) - first.getUTCDay() + 7) % 7);
  const occurrences: EventData[] = [];
  // Chat windows are at most a week; cap expansion defensively for other callers.
  for (let count = 0; count < 53 && first.toISOString().slice(0,10) <= upper; count++) {
    occurrences.push({...event, eventDate:first.toISOString().slice(0,10)});
    first.setUTCDate(first.getUTCDate() + (event.recurrenceFrequency === 'daily' ? 1 : 7));
  }
  return occurrences;
}
