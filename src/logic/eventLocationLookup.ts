import { z } from 'zod';
import { safeSourceUrl } from './eventImport.js';

export const locationFields = ['neighbourhood', 'area', 'googleMapsUrl', 'contactPhone'] as const;
export const locationLookupInputSchema = z.object({
  venueName: z.string().trim().min(2).max(300),
  neighbourhood: z.string().trim().max(300).default(''),
  area: z.string().trim().max(300).default(''),
  instagramAccount: z.string().trim().max(300).default(''),
  sourceUrl: z.string().trim().max(2000).default(''),
  missingFields: z.array(z.enum(locationFields)).min(1).max(4)
});
export type LocationLookupInput = z.infer<typeof locationLookupInputSchema>;
export const locationLookupOutputSchema = z.object({
  matched: z.boolean(),
  venueName: z.string().max(300).nullable(),
  address: z.string().max(1000).nullable(),
  explanation: z.string().max(1000),
  suggestions: z.array(z.object({
    field: z.enum(locationFields), value: z.string().max(2000),
    sourceUrl: z.string().max(2000), evidence: z.string().max(500)
  })).max(4)
});
export type LocationLookupResult = z.infer<typeof locationLookupOutputSchema>;
function publicUrl(value: string): string | null {
  try {
    const url = new URL(safeSourceUrl(value));
    if (!url.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) || url.hostname.startsWith('[')) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}
export function validateLocationLookupInput(raw: unknown): LocationLookupInput {
  const input = locationLookupInputSchema.parse(raw);
  if (input.sourceUrl && !publicUrl(input.sourceUrl)) throw new Error('Enter a public http or https source URL, or leave it empty.');
  return input;
}
export function groundedLocationResult(raw: unknown, citedUrls: string[], requestedFields: readonly string[]): LocationLookupResult {
  const result = locationLookupOutputSchema.parse(raw);
  const citations = new Set(citedUrls.map(publicUrl).filter(Boolean));
  if (!result.matched) return {...result,suggestions:[]};
  const seen = new Set<string>();
  const suggestions = result.suggestions.filter(suggestion => {
    const source = publicUrl(suggestion.sourceUrl);
    if (!requestedFields.includes(suggestion.field) || seen.has(suggestion.field) || !suggestion.value.trim() || !suggestion.evidence.trim() || !source || !citations.has(source)) return false;
    if (suggestion.field === 'googleMapsUrl') {
      const map = publicUrl(suggestion.value);
      if (!map || !citations.has(map)) return false;
      const url = new URL(map);
      if (!(url.hostname === 'maps.app.goo.gl' || (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps')) || (url.hostname === 'www.google.com' && url.pathname.startsWith('/maps')) || url.hostname === 'maps.google.com')) return false;
    }
    if (suggestion.field === 'contactPhone' && (!/^\+?[\d\s().-]{6,40}$/.test(suggestion.value) || suggestion.value.replace(/\D/g,'').length < 6)) return false;
    seen.add(suggestion.field);
    return true;
  });
  return {...result,suggestions};
}
