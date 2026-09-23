import { pool } from "../integrations/postgres.js";
import { validateEvent, type EventData, type EventSource, type EventVenue, type ExtractedEvent, type EventContext } from "../logic/eventImport.js";
import type { EventDraft } from "../logic/eventImportDraft.js";

export type AdminEvent = { id: string; data: EventData; source: EventSource | null;
  extraction: { result: ExtractedEvent | null; context: EventContext } | null; updatedAt: string };
export async function listEventVenues(): Promise<EventVenue[]> {
  const result = await pool.query<EventVenue>("SELECT id, name, neighbourhood, area FROM public.places ORDER BY name");
  return result.rows;
}
function eventFromRow(row: Record<string, any>): AdminEvent {
  return { id: row.id, data: { ...row.details, title: row.title, placeId: row.place_id,
    eventDate: row.event_date ? String(row.event_date) : null },
    source: row.source, extraction: row.extraction, updatedAt: new Date(row.updated_at).toISOString() };
}
export async function listAdminEvents(): Promise<AdminEvent[]> {
  const result = await pool.query("SELECT *, event_date::text AS event_date FROM public.events ORDER BY event_date DESC NULLS LAST, created_at DESC LIMIT 200");
  return result.rows.map(eventFromRow);
}
export async function getAdminEvent(id: string): Promise<AdminEvent | null> {
  const result = await pool.query("SELECT *, event_date::text AS event_date FROM public.events WHERE id=$1", [id]);
  return result.rows[0] ? eventFromRow(result.rows[0]) : null;
}
export async function saveAdminEvent(input: { data: EventData; draft?: EventDraft; id?: string; admin: string }): Promise<string> {
  const data = validateEvent(input.data as unknown as Record<string, unknown>);
  if (data.placeId) {
    const place = await pool.query("SELECT id FROM public.places WHERE id=$1", [data.placeId]);
    if (!place.rowCount) throw new Error("The selected place no longer exists. Choose another place or leave it unlinked.");
  }
  if (input.id) {
    const result = await pool.query<{ id: string }>(
      "UPDATE public.events SET title=$1, place_id=$2, event_date=$3, details=$4::jsonb, updated_at=NOW() WHERE id=$5 RETURNING id",
      [data.title, data.placeId, data.eventDate, JSON.stringify(data), input.id]);
    if (!result.rows[0]) throw new Error("Event not found.");
    return result.rows[0].id;
  }
  if (!input.draft) throw new Error("Missing review data.");
  const result = await pool.query<{ id: string }>(
    `INSERT INTO public.events (title, place_id, event_date, details, source, extraction, import_id, created_by)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8)
     ON CONFLICT (import_id) DO UPDATE SET import_id=EXCLUDED.import_id RETURNING id`,
    [data.title, data.placeId, data.eventDate, JSON.stringify(data), JSON.stringify(input.draft.source),
      JSON.stringify({ result: input.draft.extraction, context: input.draft.context }), input.draft.id, input.admin]);
  return result.rows[0].id;
}
