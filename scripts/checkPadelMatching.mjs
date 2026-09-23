import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && specifier.endsWith('.js')) {
    const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
    if (existsSync(url)) return next(url.href, context);
  }
  return next(specifier, context);
} });
const { placeMatchesSpecificFocus } = await import('../src/logic/scorePlace.ts');
const { placeMatchesSearchTerm, placePassesSearchProfileHardConstraints } = await import('../src/logic/searchProfileMatching.ts');
const { normalizeActivityIntent } = await import('../src/logic/activityIntent.ts');
const { findMatchingCandidates } = await import('../src/logic/selectBestPlace.ts');
const base = { id: 'restaurant', name: 'Rocca Marina', region: 'Dakar', neighbourhood: 'Almadies', categories: ['food'], subcategories: [], bestFor: [], occasionTags: [], vibeTags: [], audienceTags: [], amenities: [], dietaryTags: [], travellerTypes: [], bestTiming: [], notIdealFor: [], practicalInfo: 'Behind 11 Players Padel Club. Sports nearby.', shortDescription: 'Restaurant near the padel courts.', personalTip: 'Drinks after padel.', status: 'ready' };
const club = { ...base, id: 'club', name: '11 Players', categories: ['sports'], subcategories: [{ name: 'padel' }] };
const tennis = { ...club, id: 'tennis', subcategories: [{ name: 'tennis' }] };
const profile = { activity: 'sports', products: ['padel'], occasions: [], dietaryRequirements: [], amenities: [], exclusions: { products: [], categories: [], audienceTags: [], dietary: [] } };
for (const venue of [base, { ...base, name: 'Café near Padel Club' }, tennis]) {
  assert.equal(placeMatchesSpecificFocus(venue, 'padel'), false);
  assert.equal(placeMatchesSearchTerm(venue, 'padel'), false);
  assert.equal(placePassesSearchProfileHardConstraints(venue, profile), false);
}
assert.equal(placeMatchesSpecificFocus(club, 'padel'), true);
assert.equal(placePassesSearchProfileHardConstraints(club, profile), true);
const context = { language: 'nl', intent: 'sports', requestedSubcategory: 'padel', targetRegion: 'Almadies', searchProfile: profile };
assert.deepEqual(findMatchingCandidates([base, club, tennis], context).map(x => x.id), ['club']);
assert.deepEqual(findMatchingCandidates([base, tennis], context), []);
assert.equal(normalizeActivityIntent('Waar kan ik padel spelen?').focus, 'padel');
console.log('Padel matching checks passed: nearby restaurants excluded; actual padel category required.');
