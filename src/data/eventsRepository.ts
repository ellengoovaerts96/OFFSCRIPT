import { pool } from "../integrations/postgres.js";
import { createHash } from "node:crypto";
import { emptyEvent, fillEventVenue, validateEvent, type EventData, type EventSource, type EventVenue, type ExtractedEvent, type EventContext } from "../logic/eventImport.js";
import type { EventDraft } from "../logic/eventImportDraft.js";

export type AdminEvent = { id: string; data: EventData; source: EventSource | null;
  extraction: { result: ExtractedEvent | null; context: EventContext } | null; updatedAt: string };
export async function listEventVenues(): Promise<EventVenue[]> {
  const result = await pool.query<EventVenue>(`SELECT id, name, neighbourhood, area, google_maps_url AS "googleMapsUrl", reservation_phone AS "contactPhone", 'place' AS kind FROM public.places
    UNION ALL SELECT id, name, neighbourhood, area, google_maps_url AS "googleMapsUrl", contact_phone AS "contactPhone", 'event' AS kind FROM public.event_venues ORDER BY name`);
  return result.rows;
}
function eventFromRow(row: Record<string, any>): AdminEvent {
  return { id: row.id, data: { ...emptyEvent(), ...row.details, title: row.title, placeId: row.place_id, eventVenueId: row.event_venue_id ?? null, status: row.status,
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
  let data = validateEvent(input.data as unknown as Record<string, unknown>);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize retries for the same review before creating an event venue.
    if (!input.id && input.draft) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.draft.id]);
      const previous = await client.query<{id:string}>("SELECT id FROM public.events WHERE import_id=$1", [input.draft.id]);
      if (previous.rows[0]) { await client.query("COMMIT"); return previous.rows[0].id; }
    }
    if (data.placeId || data.eventVenueId) {
      const isPlace = Boolean(data.placeId);
      const result = await client.query<EventVenue>(isPlace
        ? `SELECT id,name,neighbourhood,area,google_maps_url AS "googleMapsUrl",reservation_phone AS "contactPhone",'place' AS kind FROM public.places WHERE id=$1`
        : `SELECT id,name,neighbourhood,area,google_maps_url AS "googleMapsUrl",contact_phone AS "contactPhone",'event' AS kind FROM public.event_venues WHERE id=$1`, [data.placeId || data.eventVenueId]);
      if (!result.rows[0]) throw new Error("The selected venue no longer exists. Select another venue or enter its details.");
      data = fillEventVenue(data, result.rows[0]);
    } else if (data.venueName) {
      // A manually saved standalone venue is reusable without becoming a curated place.
      const key = createHash("sha256").update(JSON.stringify([data.venueName,data.neighbourhood,data.area,data.googleMapsUrl].map(value=>value.normalize("NFKC").toLowerCase().trim()))).digest("hex");
      const venue = await client.query<{id:string}>(`INSERT INTO public.event_venues(identity_key,name,neighbourhood,area,google_maps_url,contact_phone)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(identity_key) DO UPDATE SET identity_key=EXCLUDED.identity_key RETURNING id`,
        [key,data.venueName,data.neighbourhood,data.area,data.googleMapsUrl,data.contactPhone]);
      data.eventVenueId = venue.rows[0].id;
    }
    data = validateEvent(data as unknown as Record<string,unknown>);
    let result;
    if (input.id) {
      result = await client.query<{id:string}>(`UPDATE public.events SET title=$1,place_id=$2,event_date=$3,details=$4::jsonb,
        event_venue_id=$5,status=$6,updated_at=NOW() WHERE id=$7 RETURNING id`,
        [data.title,data.placeId,data.eventDate,JSON.stringify(data),data.eventVenueId,data.status,input.id]);
    } else {
      if (!input.draft) throw new Error("Missing review data.");
      result = await client.query<{id:string}>(`INSERT INTO public.events(title,place_id,event_date,details,source,extraction,import_id,created_by,event_venue_id,status)
        VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10) RETURNING id`,
        [data.title,data.placeId,data.eventDate,JSON.stringify(data),JSON.stringify(input.draft.source),
          JSON.stringify({result:input.draft.extraction,context:input.draft.context}),input.draft.id,input.admin,data.eventVenueId,data.status]);
    }
    if (!result.rows[0]) throw new Error("Event not found.");
    await client.query("COMMIT");
    return result.rows[0].id;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function listPublishedEvents(start: string, end: string): Promise<EventData[]> {
  const result = await pool.query(`SELECT e.*, e.event_date::text AS event_date,
    COALESCE(p.name,v.name) AS venue_name, COALESCE(p.neighbourhood,v.neighbourhood) AS venue_neighbourhood,
    COALESCE(p.area,v.area) AS venue_area, COALESCE(p.google_maps_url,v.google_maps_url) AS venue_maps,
    COALESCE(p.reservation_phone,v.contact_phone) AS venue_phone
    FROM public.events e LEFT JOIN public.places p ON p.id=e.place_id LEFT JOIN public.event_venues v ON v.id=e.event_venue_id
    WHERE e.status='published' AND e.event_date BETWEEN $1::date AND $2::date
      AND e.event_date >= (NOW() AT TIME ZONE 'Africa/Dakar')::date
    ORDER BY e.event_date, e.details->>'startTime', e.id LIMIT 100`, [start,end]);
  return result.rows.map(row => {
    const data = eventFromRow(row).data;
    return { ...data, venueName:data.venueName || row.venue_name || '', neighbourhood:data.neighbourhood || row.venue_neighbourhood || '',
      area:data.area || row.venue_area || '', googleMapsUrl:data.googleMapsUrl || row.venue_maps || '', contactPhone:data.contactPhone || row.venue_phone || '' };
  });
}
