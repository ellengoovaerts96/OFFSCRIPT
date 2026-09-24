import { pool } from '../integrations/postgres.js';
import { fingerprint, mapResearchToPlace, matchingResearchPlaces, requireNewPlace, type ResearchStatus, type ResearchApprovalPlan } from '../logic/fieldResearch.js';
import { editorialValuesEqual } from '../logic/editorialLocks.js';
export type ResearchItem = {
    id: string;
    key: string;
    sourceId: string | null;
    sourceType: string;
    raw: Record<string, unknown>;
    payload: Record<string, unknown>;
    reviewed: Record<string, unknown>;
    status: ResearchStatus;
    version: number;
    snapshot: unknown;
    placeId: string | null;
    error: string | null;
};
const rowItem = (row: Record<string, any>): ResearchItem => ({ id: String(row.id), key: row.source_key, sourceId: row.source_row_id, sourceType: row.source_type, raw: row.raw, payload: row.payload, reviewed: row.reviewed ?? {}, status: row.status ?? 'new', version: row.version ?? 0, snapshot: row.raw_snapshot, placeId: row.approved_place_id, error: row.processing_error });
const select = `SELECT i.*,r.reviewed,r.status,r.version,r.raw_snapshot,r.approved_place_id FROM field_research_inbox i LEFT JOIN field_research_reviews r USING(source_key)`;
export const itemHash = (item: ResearchItem) => fingerprint({ raw: item.raw, payload: item.payload });
export const itemValues = (item: ResearchItem) => ({ ...item.payload, ...item.reviewed });
export async function listResearch(): Promise<ResearchItem[]> { return (await pool.query(select + ' ORDER BY i.id DESC')).rows.map(rowItem); }
export async function getResearch(id: string): Promise<ResearchItem | null> { const result = await pool.query(select + ' WHERE i.id=$1', [id]); return result.rows[0] ? rowItem(result.rows[0]) : null; }
export async function researchSyncState() { return (await pool.query('SELECT * FROM field_research_sync_state WHERE id=1')).rows[0] ?? null; }
export async function saveResearch(id: string, version: number, hash: string, reviewed: Record<string, string>, status: ResearchStatus, admin: string): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM field_research_inbox WHERE id=$1 FOR UPDATE', [id]);
        const found = await client.query(select + ' WHERE i.id=$1', [id]);
        if (!found.rows[0])
            throw new Error('Submission not found.');
        const item = rowItem(found.rows[0]);
        if (item.version !== version || itemHash(item) !== hash)
            throw new Error('This submission changed. Reload it before saving.');
        if (status === 'approved' && (item.status !== 'approved' || fingerprint(reviewed) !== fingerprint(item.reviewed)))
            throw new Error('Use In review for edits, then Approve / Add to Places.');
        await client.query(`INSERT INTO field_research_reviews(source_key,raw_id,source_row_id,status,reviewed,raw_snapshot,updated_by)
   VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) ON CONFLICT(source_key) DO UPDATE SET status=EXCLUDED.status,reviewed=EXCLUDED.reviewed,
   raw_snapshot=EXCLUDED.raw_snapshot,version=field_research_reviews.version+1,updated_by=EXCLUDED.updated_by,updated_at=NOW()`, [item.key, id, item.sourceId, status, JSON.stringify(reviewed), JSON.stringify({ raw: item.raw, payload: item.payload }), admin]);
        await client.query('COMMIT');
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
export async function placeChoices(item: ResearchItem) { return matchingResearchPlaces({ ...itemValues(item), source_row_id: item.sourceId }, (await pool.query('SELECT * FROM places ORDER BY name')).rows); }
export async function approvalPreview(item: ResearchItem, action: 'create' | 'update', placeId: string | null) {
    if (item.status === 'approved')
        throw new Error('Already approved. Move to In review before making another change.');
    if (item.status !== 'in_review')
        throw new Error('Save this submission as In review before approving.');
    const values = mapResearchToPlace(itemValues(item));
    if (!['place', 'update'].includes(String(itemValues(item).entry_type ?? 'place').toLowerCase()))
        throw new Error('Only place/update submissions can be added to Places. Keep other notes in this inbox.');
    let existing: Record<string, unknown> | null = null;
    if (action === 'update') {
        if (!placeId)
            throw new Error('Choose an existing place.');
        const result = await pool.query('SELECT * FROM places WHERE id=$1', [placeId]);
        existing = result.rows[0] ?? null;
        if (!existing)
            throw new Error('Place not found.');
    }
    else {
        requireNewPlace(values);
        if ((await pool.query('SELECT id FROM places WHERE name=$1', [values.name])).rows.length)
            throw new Error('A place with this exact name already exists. Choose Update existing place, or edit the name to distinguish the new location.');
    }
    const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) => !existing || !editorialValuesEqual(existing[key], value)));
    const plan: ResearchApprovalPlan = { rawId: item.id, version: item.version, rawHash: itemHash(item), action, placeId: existing ? String(existing.id) : null, placeHash: existing ? fingerprint(existing) : null, expires: Date.now() + 30 * 60000 };
    return { plan, existing, changes };
}
export async function approveResearch(plan: ResearchApprovalPlan, fields: string[], admin: string): Promise<string> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM field_research_inbox WHERE id=$1 FOR UPDATE', [plan.rawId]);
        const source = await client.query(select + ' WHERE i.id=$1', [plan.rawId]);
        if (!source.rows[0])
            throw new Error('Submission not found.');
        const item = rowItem(source.rows[0]);
        if (item.version !== plan.version || itemHash(item) !== plan.rawHash || item.status !== 'in_review')
            throw new Error('The review changed or was already approved. Reload before approving.');
        let existing: Record<string, any> | null = null;
        if (plan.action === 'update') {
            const target = await client.query('SELECT * FROM places WHERE id=$1 FOR UPDATE', [plan.placeId]);
            existing = target.rows[0];
            if (!existing || fingerprint(existing) !== plan.placeHash)
                throw new Error('The existing place changed. Review the differences again.');
        }
        const values = mapResearchToPlace(itemValues(item));
        const selected = plan.action === 'create' ? Object.keys(values) : [...new Set(fields)];
        if (selected.some(key => !(key in values)))
            throw new Error('Invalid selected field.');
        const changes = Object.fromEntries(selected.map(key => [key, values[key]]));
        let placeId = plan.placeId;
        if (plan.action === 'create') {
            requireNewPlace(changes);
            const bound = item.sourceId ? await client.query('SELECT id FROM places WHERE source_row_id=$1', [item.sourceId]) : { rows: [] };
            const insert = { country: null, child_friendly: null, ...changes, source_row_id: bound.rows.length ? null : item.sourceId, source: `${item.sourceType}:${item.sourceId ?? item.id}`, status: 'draft', editorial_locked_fields: Object.keys(changes), editorial_updated_by: admin };
            const columns = Object.keys(insert);
            const result = await client.query<{
                id: string;
            }>(`INSERT INTO places(${columns.join(',')}) VALUES(${columns.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`, Object.values(insert));
            placeId = result.rows[0].id;
        }
        else if (selected.length) {
            const locked = [...new Set([...(existing?.editorial_locked_fields ?? []), ...selected])];
            await client.query(`UPDATE places SET ${selected.map((key, i) => key + '=$' + (i + 1)).join(',')},editorial_locked_fields=$${selected.length + 1},editorial_updated_by=$${selected.length + 2},editorial_updated_at=NOW(),updated_at=NOW() WHERE id=$${selected.length + 3}`, [...Object.values(changes), locked, admin, placeId]);
        }
        if (selected.includes('subcategories')) {
            const names = changes.subcategories as string[];
            const attached = await client.query(`SELECT s.name FROM place_subcategories s JOIN place_subcategory_images i ON i.place_subcategory_id=s.id WHERE s.place_id=$1 AND NOT(s.name=ANY($2::text[])) LIMIT 1`, [placeId, names]);
            if (attached.rows.length)
                throw new Error('This change would remove a subcategory with photos. Keep that subcategory here and manage its photos in the existing Places editor first.');
            await client.query('DELETE FROM place_subcategories WHERE place_id=$1 AND NOT(name=ANY($2::text[]))', [placeId, names]);
            for (const [order, name] of names.entries())
                await client.query('INSERT INTO place_subcategories(place_id,name,display_order) VALUES($1,$2,$3) ON CONFLICT(place_id,name) DO UPDATE SET display_order=EXCLUDED.display_order', [placeId, name, order]);
        }
        await client.query(`INSERT INTO field_research_approvals(source_key,source_row_id,raw_id,place_id,action,raw_snapshot,reviewed_snapshot,changes,approved_by)
   VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9)`, [item.key, item.sourceId, item.id, placeId, plan.action, JSON.stringify(item.raw), JSON.stringify(itemValues(item)), JSON.stringify(changes), admin]);
        await client.query(`UPDATE field_research_reviews SET status='approved',approved_place_id=$1,version=version+1,updated_by=$2,updated_at=NOW() WHERE source_key=$3`, [placeId, admin, item.key]);
        await client.query('COMMIT');
        return placeId!;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
