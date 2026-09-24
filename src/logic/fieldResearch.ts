import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { extractVibeTags } from './vibeTags.js';
import { PLACE_AMENITIES } from '../types/place.js';
export const researchStatuses = { new: 'New', in_review: 'In review', approved: 'Approved', rejected: 'Rejected', archived: 'Archived' } as const;
export type ResearchStatus = keyof typeof researchStatuses;
export const researchSections: Record<string, string[]> = {
    'Basic information': ['place', 'entry_type', 'country', 'region', 'neighbourhood', 'area', 'area_en', 'area_fr', 'categories', 'subcategories', 'google_maps_url', 'latitude', 'longitude'],
    'Editorial': ['field_note', 'review_notes', 'authenticity', 'audience_orientation', 'adventure_level', 'audience_tags', 'occasion_tags', 'dietary_tags', 'tuuti_pick_level', 'tuuti_priority', 'tuuti_reason_en', 'work_friendly', 'update_notes', 'short_description', 'short_description_en', 'short_description_fr', 'why_hidden_gem', 'vibe', 'food_orientation', 'traveller_types', 'child_friendly', 'price_level', 'personal_tip', 'personal_tip_en', 'personal_tip_fr', 'story', 'story_en', 'story_fr', 'paid_experience_later', 'experience_idea'],
    'Practical information': ['practical_info', 'practical_info_en', 'practical_info_fr', 'best_timing', 'safety_notes', 'transport', 'amenities', 'contact_person', 'phone', 'facebook_url', 'instagram_url', 'tiktok_url', 'opening_hours', 'payment_notes', 'website']
};
export const researchFields = Object.values(researchSections).flat();
export const fieldLabel = (key: string) => key.split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
export const rawKey = (row: Record<string, unknown>) => row.source_row_id ? 'source:' + row.source_row_id : 'raw:' + row.id;
function canonical(value: unknown): unknown {
    if (value instanceof Date)
        return value.toISOString();
    if (Array.isArray(value))
        return value.map(canonical);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
    return value;
}
export const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const text = (value: unknown) => value == null ? '' : String(value).trim();
export function webUrl(value: unknown): string {
    try {
        const url = new URL(text(value));
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    }
    catch {
        return '';
    }
}
export function reviewedInput(body: Record<string, unknown>, raw: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const field of researchFields) {
        if (!(field in raw))
            continue;
        const value = body[field];
        if (value !== undefined && typeof value !== 'string')
            throw new Error('Invalid ' + fieldLabel(field));
        const string = text(value);
        if (string.length > 12000)
            throw new Error(fieldLabel(field) + ' is too long.');
        result[field] = string;
    }
    return result;
}
const list = (value: unknown) => [...new Set(text(value).split(',').map(item => item.trim()).filter(Boolean))];
export function mapResearchToPlace(row: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const direct = ['country', 'region', 'neighbourhood', 'area', 'area_en', 'area_fr', 'short_description_en', 'short_description_fr', 'practical_info', 'practical_info_en', 'practical_info_fr', 'personal_tip', 'personal_tip_en', 'personal_tip_fr', 'story_en', 'story_fr', 'vibe', 'google_maps_url', 'safety_notes', 'facebook_url', 'instagram_url', 'tiktok_url', 'transport', 'opening_hours', 'payment_notes'];
    for (const key of direct)
        if (text(row[key]))
            result[key] = text(row[key]);
    result.name = text(row.place);
    result.short_description = text(row.short_description_en) || text(row.short_description);
    if (!result.practical_info)
        result.practical_info = text(row.practical_info_en) || undefined;
    if (!result.personal_tip)
        result.personal_tip = text(row.personal_tip_en) || undefined;
    if (!result.story_en && text(row.story))
        result.story_en = text(row.story);
    for (const key of ['categories', 'subcategories', 'traveller_types', 'best_timing'])
        if (text(row[key]))
            result[key] = list(row[key]);
    if (text(row.amenities)) {
        const supplied = list(row.amenities).map(item => item.toLowerCase().replace(/\s+/g, '_'));
        if (supplied.some(item => !(PLACE_AMENITIES as readonly string[]).includes(item)))
            throw new Error('Check amenities: one or more values are not supported by Places.');
        result.amenities = supplied;
    }
    if (text(row.vibe))
        result.vibe_tags = extractVibeTags(text(row.vibe));
    if (text(row.child_friendly)) {
        if (/^(yes|true|ja|oui|1)$/i.test(text(row.child_friendly)))
            result.child_friendly = true;
        else if (/^(no|false|nee|non|0)$/i.test(text(row.child_friendly)))
            result.child_friendly = false;
        else if (!/^(unknown|onbekend|inconnu)$/i.test(text(row.child_friendly)))
            throw new Error('Child friendly must be yes, no or unknown.');
    }
    if (text(row.price_level)) {
        const prices: Record<string, number> = { '1': 1, budget: 1, low: 1, '€': 1, '$': 1, '2': 2, affordable: 2, betaalbaar: 2, '€€': 2, '$$': 2, '3': 3, average: 3, medium: 3, 'mid-range': 3, gemiddeld: 3, '4': 4, chic: 4, high: 4, upscale: 4, '€€€': 4, '$$$': 4, '5': 5, luxury: 5, luxe: 5, '€€€€': 5, '$$$$': 5 };
        const price = prices[text(row.price_level).toLowerCase()];
        if (!price)
            throw new Error('Choose a supported price level (1–5).');
        result.price_level = price;
    }
    for (const key of ['audience_tags', 'occasion_tags', 'dietary_tags'])
        if (text(row[key]))
            result[key] = list(row[key]);
    for (const [key, min, max, target] of [['authenticity', 0, 4, 'authenticity'], ['food_orientation', -2, 2, 'food_orientation'], ['audience_orientation', -2, 2, 'audience_orientation'], ['adventure_level', 0, 3, 'adventure_level'], ['tuuti_pick_level', 0, 3, 'offscript_pick_level'], ['tuuti_priority', 0, 100, 'offscript_priority']] as const) {
        if (!text(row[key]))
            continue;
        const number = Number(row[key]);
        if (!Number.isInteger(number) || number < min || number > max)
            throw new Error(fieldLabel(key) + ' must be between ' + min + ' and ' + max);
        result[target] = number;
    }
    if (text(row.tuuti_reason_en))
        result.offscript_reason_en = text(row.tuuti_reason_en);
    if (text(row.work_friendly)) {
        if (!/^(true|false|yes|no|oui|non|ja|nee)$/i.test(text(row.work_friendly)))
            throw new Error('Work friendly must be yes or no, or empty.');
        result.work_friendly = /^(true|yes|oui|ja)$/i.test(text(row.work_friendly));
    }
    if (text(row.phone))
        result.reservation_phone = text(row.phone);
    if (text(row.contact_person))
        result.reservation_contact_name = text(row.contact_person);
    for (const key of ['latitude', 'longitude'])
        if (text(row[key])) {
            const value = Number(row[key]);
            const max = key === 'latitude' ? 90 : 180;
            if (!Number.isFinite(value) || Math.abs(value) > max)
                throw new Error('Invalid ' + key);
            result[key] = value;
        }
    for (const key of ['google_maps_url', 'facebook_url', 'instagram_url', 'tiktok_url'])
        if (result[key] && !webUrl(result[key]))
            throw new Error('Invalid ' + fieldLabel(key));
    // Unknown source attributes stay in the review; they are never inferred or written as invented Place fields.
    return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined && value !== ''));
}
export function requireNewPlace(values: Record<string, unknown>): void {
    for (const key of ['name', 'region', 'short_description', 'google_maps_url'])
        if (!values[key])
            throw new Error('Complete ' + fieldLabel(key) + ' before creating a place.');
}
export function matchingResearchPlaces(row: Record<string, unknown>, places: Record<string, unknown>[]): Record<string, unknown>[] {
    const norm = (value: unknown) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const name = norm(row.place);
    const words = new Set(name.split(' ').filter(word => word.length > 2));
    return places.filter(place => {
        if (row.source_row_id && place.source_row_id === row.source_row_id)
            return true;
        if (webUrl(row.google_maps_url) && webUrl(row.google_maps_url) === webUrl(place.google_maps_url))
            return true;
        const candidate = norm(place.name);
        if (!name || !candidate)
            return false;
        if (name === candidate || Math.min(name.length, candidate.length) >= 4 && (name.includes(candidate) || candidate.includes(name)))
            return true;
        const other = candidate.split(' ').filter(word => word.length > 2);
        const overlap = other.filter(word => words.has(word)).length;
        return overlap > 0 && overlap / Math.max(words.size, other.length) >= 0.6;
    });
}
export type ResearchApprovalPlan = {
    rawId: string;
    version: number;
    rawHash: string;
    action: 'create' | 'update';
    placeId: string | null;
    placeHash: string | null;
    expires: number;
};
export function signResearchPlan(plan: ResearchApprovalPlan): string {
    const key = process.env.INBOX_PASSWORD;
    if (!key)
        throw new Error('Admin is not configured.');
    const payload = Buffer.from(JSON.stringify(plan)).toString('base64url');
    return payload + '.' + createHmac('sha256', key).update('research:' + payload).digest('base64url');
}
export function readResearchPlan(token: unknown): ResearchApprovalPlan {
    if (typeof token !== 'string' || token.length > 5000)
        throw new Error('Invalid approval preview.');
    const [payload, signature, ...extra] = token.split('.');
    const key = process.env.INBOX_PASSWORD;
    if (!key || !payload || !signature || extra.length)
        throw new Error('Invalid approval preview.');
    const expected = createHmac('sha256', key).update('research:' + payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
        throw new Error('Invalid approval preview.');
    const plan = JSON.parse(Buffer.from(payload, 'base64url').toString()) as ResearchApprovalPlan;
    if (!Number.isFinite(plan.expires) || plan.expires < Date.now())
        throw new Error('Approval preview expired. Review it again.');
    return plan;
}
