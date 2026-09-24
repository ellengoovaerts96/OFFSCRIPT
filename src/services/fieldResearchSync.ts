import { google } from 'googleapis';
import { pool } from '../integrations/postgres.js';
import { headers, structureDraft, explicitAssessment, structuredRow } from './fieldNotesExtraction.js';
import { dashboardConfig } from '../logic/dashboardConfig.js';
const normalize = (value: unknown) => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const col = (n: number): string => n > 26 ? col(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + (n - 1) % 26) : String.fromCharCode(64 + n);
export const researchAutomationReady = () => Boolean(process.env.GOOGLE_FIELD_NOTES_SPREADSHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.OPENAI_API_KEY);
export const researchStaging = () => dashboardConfig().environment === 'STAGING';
export async function mirrorLegacyResearch(): Promise<void> {
    await pool.query(`INSERT INTO public.field_research_inbox(source_key,source_row_id,source_type,raw,payload)
  SELECT 'legacy:'||COALESCE(NULLIF(source_row_id,''),id::text),source_row_id,'field_research_raw',to_jsonb(r),to_jsonb(r) FROM public.field_research_raw r
  ON CONFLICT(source_key) DO UPDATE SET raw=EXCLUDED.raw,payload=EXCLUDED.payload,synced_at=NOW()
  WHERE field_research_inbox.raw IS DISTINCT FROM EXCLUDED.raw`);
}
async function mirror(key: string, id: string, raw: Record<string, unknown>, payload: Record<string, unknown>, error: string | null = null) {
    await pool.query(`INSERT INTO public.field_research_inbox(source_key,source_row_id,source_type,raw,payload,processing_error)
 VALUES($1,$2,'field_notes',$3::jsonb,$4::jsonb,$5) ON CONFLICT(source_key) DO UPDATE SET raw=CASE WHEN EXCLUDED.raw=jsonb_build_object('source_note_id',EXCLUDED.source_row_id) THEN field_research_inbox.raw ELSE EXCLUDED.raw END,
 payload=CASE WHEN EXCLUDED.payload='{}'::jsonb THEN field_research_inbox.payload ELSE EXCLUDED.payload END,
 processing_error=CASE WHEN field_research_inbox.retry_after>NOW() AND EXCLUDED.processing_error IS NULL THEN field_research_inbox.processing_error ELSE EXCLUDED.processing_error END,synced_at=NOW()`, [key, id, JSON.stringify(raw), JSON.stringify(payload), error]);
}
export async function syncFieldResearch(): Promise<void> {
    if (!researchStaging())
        throw new Error('Field Research automation is enabled on staging only.');
    const client = await pool.connect();
    try {
        const lock = await client.query<{
            locked: boolean;
        }>('SELECT pg_try_advisory_lock(714923,62) AS locked');
        if (!lock.rows[0].locked)
            return;
        await pool.query(`INSERT INTO field_research_sync_state(id,last_attempt) VALUES(1,NOW()) ON CONFLICT(id) DO UPDATE SET last_attempt=NOW()`);
        await mirrorLegacyResearch();
        if (!researchAutomationReady())
            throw new Error('Configure GOOGLE_FIELD_NOTES_SPREADSHEET_ID, Google service-account credentials and OPENAI_API_KEY to automate Field Notes.');
        const spreadsheetId = process.env.GOOGLE_FIELD_NOTES_SPREADSHEET_ID!;
        const auth = new google.auth.JWT({ email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
        const sheets = google.sheets({ version: 'v4', auth });
        const read = async (title: string) => (await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${title}'!A:ZZ` }, { timeout: 20000 })).data.values ?? [];
        const source = await read('Field Notes');
        if (!source.length)
            throw new Error('Field Notes has no header row.');
        const sourceHeaders = source[0].map(String), normalized = sourceHeaders.map(normalize);
        const index = (aliases: string[]) => normalized.findIndex(h => aliases.includes(h));
        const stamp = index(['timestamp', 'horodateur']), note = index(['note de terrain', 'draft']), researcher = index(['nom de la personne qui fait la recherche', 'researcher']), visit = index(['date de la visite', 'date de visite', 'visit_date', 'visit date', 'date visited']), status = index(['status', 'statut']);
        if (stamp < 0 || note < 0)
            throw new Error('Field Notes must contain Timestamp/Horodateur and Note de terrain.');
        const structured = await read('Structured Import');
        let targetHeaders = (structured[0] ?? []).map(String);
        // Append missing columns; never clear, reorder or overwrite existing structured rows.
        const missing = headers.filter(header => !targetHeaders.includes(header));
        if (missing.length) {
            targetHeaders = [...targetHeaders, ...missing];
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `'Structured Import'!A1:${col(targetHeaders.length)}1`, valueInputOption: 'RAW', requestBody: { values: [targetHeaders] } }, { timeout: 20000 });
        }
        const byId = new Map<string, Record<string, unknown>>();
        for (const row of structured.slice(1)) {
            const record = Object.fromEntries(targetHeaders.map((h, i) => [h, row[i] ?? '']));
            const id = String(record.source_note_id ?? '');
            if (id)
                byId.set(id, record);
        }
        const timestampCounts = new Map<string, number>();
        for (const row of source.slice(1)) {
            const value = String(row[stamp] ?? '').trim();
            timestampCounts.set(value, (timestampCounts.get(value) ?? 0) + 1);
        }
        const cooldowns = new Set((await pool.query<{
            source_key: string;
        }>('SELECT source_key FROM field_research_inbox WHERE retry_after>NOW()')).rows.map(row => row.source_key));
        let generated = 0;
        const seen = new Set<string>();
        for (const [offset, row] of source.slice(1).entries()) {
            if (!row.some(value => String(value ?? '').trim()))
                continue;
            const timestamp = String(row[stamp] ?? '').trim(), draft = String(row[note] ?? '').trim();
            const collision = !timestamp || timestampCounts.get(timestamp)! > 1;
            const id = collision ? `field-note:${timestamp || 'missing'}:row-${offset + 2}` : `field-note:${timestamp}`;
            const raw = Object.fromEntries(sourceHeaders.map((h, i) => [h, row[i] ?? '']));
            seen.add(id);
            let proposal = byId.get(id);
            const seed = { source_note_id: id, source_timestamp: timestamp, researcher: row[researcher] ?? '', visit_date: row[visit] ?? '', field_note: draft };
            const canonical = (record: Record<string, unknown>) => ({ ...seed, ...record, place: record.place_name ?? '', timestamp, source_row_id: id });
            await mirror('notes:' + id, id, raw, canonical(proposal ?? {}), collision ? 'Duplicate or missing source timestamp; check the original submission.' : null);
            if (collision || proposal || !draft || generated >= 3 || cooldowns.has('notes:' + id))
                continue;
            const currentStatus = status < 0 ? '' : normalize(row[status]);
            if (currentStatus && !['new', 'ai_error'].includes(currentStatus))
                continue;
            try {
                const observations = Object.fromEntries(normalized.map((h, i) => [h, row[i] ?? null]));
                const assessment = explicitAssessment(observations);
                generated++;
                const extracted = await structureDraft({ source_note_id: id, timestamp, draft, form_observations: observations });
                Object.assign(extracted, assessment);
                const cells = structuredRow(id, timestamp, String(row[visit] ?? ''), String(row[researcher] ?? ''), extracted);
                proposal = Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
                await sheets.spreadsheets.values.append({ spreadsheetId, range: `'Structured Import'!A:${col(targetHeaders.length)}`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [targetHeaders.map(h => proposal![h] ?? '')] } }, { timeout: 20000 });
                byId.set(id, proposal);
                await mirror('notes:' + id, id, raw, canonical(proposal));
                await pool.query('UPDATE field_research_inbox SET retry_after=NULL,processing_error=NULL WHERE source_key=$1', ['notes:' + id]);
                if (status >= 0)
                    await sheets.spreadsheets.values.update({ spreadsheetId, range: `'Field Notes'!${col(status + 1)}${offset + 2}`, valueInputOption: 'RAW', requestBody: { values: [['ai_processed']] } }, { timeout: 20000 });
            }
            catch (error) {
                console.error('Field Note processing failed', id, error);
                await pool.query("UPDATE field_research_inbox SET processing_error=$1,retry_after=NOW()+INTERVAL '15 minutes' WHERE source_key=$2", ['AI/Sheet processing failed. Will retry after 15 minutes; the original note is preserved.', 'notes:' + id]);
            }
        }
        for (const [id, proposal] of byId)
            if (!seen.has(id))
                await mirror('notes:' + id, id, { source_note_id: id }, { ...proposal, place: proposal.place_name ?? '', timestamp: proposal.source_timestamp ?? '', source_row_id: id });
        await pool.query('UPDATE field_research_sync_state SET last_success=NOW(),error=NULL WHERE id=1');
    }
    catch (error) {
        await pool.query('UPDATE field_research_sync_state SET error=$1 WHERE id=1', [error instanceof Error ? error.message : 'Sync failed']);
        throw error;
    }
    finally {
        try {
            await client.query('SELECT pg_advisory_unlock(714923,62)');
        }
        finally {
            client.release();
        }
    }
}
export function startFieldResearchAutomation(): void {
    if (!researchStaging() || process.env.FIELD_RESEARCH_AUTOMATION_ENABLED === 'false')
        return;
    const tick = async () => { try {
        await syncFieldResearch();
    }
    catch (error) {
        console.error('Field Research automation', error);
    }
    finally {
        setTimeout(tick, 60000).unref();
    } };
    setTimeout(tick, 3000).unref();
}
