import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Place } from '../src/types/place.js';
import { buildUserContext, acceptsBroaderLocationInContext } from '../src/ai/buildUserContext.js';
import { buildSubcategoryTaxonomy } from '../src/logic/subcategoryTaxonomy.js';
import { findMatchingCandidates, selectBestPlace } from '../src/logic/selectBestPlace.js';
import { placeMatchesSearchTerm } from '../src/logic/searchProfileMatching.js';
import { placeMatchesSpecificFocus } from '../src/logic/scorePlace.js';

// Offline fixtures model the stored cuisine tags, not live restaurant facts.
delete process.env.OPENAI_API_KEY;
function restaurant(id: string, cuisine: string, neighbourhood = 'Yoff'): Place {
  return {
    id, name:id, country:'Senegal', region:'Dakar', neighbourhood, area:neighbourhood,
    categories:['food'], subcategories:['lunch','dinner',cuisine].map(name=>({id:name,name,images:[]})),
    shortDescription:'Restaurant fixture', vibeTags:[], offscriptPickLevel:1, offscriptPriority:0,
    audienceTags:[], occasionTags:[], amenities:[], bestFor:[], notIdealFor:[], travellerTypes:[],
    childFriendly:false, bestTiming:[], closedDays:[], reservationNeeded:false,
    googleMapsUrl:'https://example.com', guideAvailable:false, guideLanguages:[], images:[], status:'ready'
  };
}
const places=[restaurant('Italian A','italian food'),restaurant('Italian B','Italian restaurant'),restaurant('Other cuisine','japanese food'),restaurant('Outside Yoff','italian food','Ngor')];
const taxonomy=buildSubcategoryTaxonomy(places);
for (const term of ['italian','italian_food','italian restaurant','italian_cuisine']) {
  assert.ok(placeMatchesSearchTerm(places[0],term),term);
  assert.ok(!placeMatchesSearchTerm(places[2],term),term);
}
assert.ok(placeMatchesSpecificFocus(places[0],'italian_restaurant'));
for (const message of ['I am looking for a romantic Italian restaurant','Ik zoek een romantisch Italiaans restaurant','Je cherche un restaurant italien romantique']) {
  const initial=await buildUserContext({message,subcategoryTaxonomy:taxonomy});
  assert.equal(initial.context.vibe,'romantic');
  assert.ok(initial.context.searchProfile?.products.includes('italian_food'));
  assert.ok(initial.context.searchProfile?.vibes.includes('romantic'));
  const local=await buildUserContext({message:'Yoff',previousContext:initial.context,previousAssistantMessage:'Which neighbourhood are you in right now?',subcategoryTaxonomy:taxonomy});
  assert.deepEqual(findMatchingCandidates(places,local.context).map(p=>p.id).sort(),['Italian A','Italian B']);
  assert.ok(selectBestPlace(places,local.context));
  const question='I do not have a strong TUUTI pick in Yoff yet. Would you be open to another Dakar neighbourhood? I can search more broadly.';
  for (const answer of ['okay','oké',"d’accord",'yes']) {
    assert.ok(acceptsBroaderLocationInContext(answer,question));
    const wider=await buildUserContext({message:answer,previousContext:local.context,previousAssistantMessage:question,subcategoryTaxonomy:taxonomy});
    assert.equal(wider.route,'place_lookup');
    assert.equal(wider.context.targetRegion,'Dakar');
    assert.equal(wider.context.vibe,'romantic');
    assert.ok(wider.context.searchProfile?.products.includes('italian_food'));
    assert.ok(findMatchingCandidates(places,wider.context).some(p=>p.id==='Outside Yoff'));
    // Broadening must also work when only an outside-neighbourhood option exists.
    assert.ok(selectBestPlace([places[3]],wider.context));
  }
  assert.ok(!acceptsBroaderLocationInContext('no',question));
  assert.ok(!acceptsBroaderLocationInContext('okay','Would you like this restaurant?'));
}
const flow=await readFile(new URL('../src/logic/chatbotFlow.ts',import.meta.url),'utf8');
assert.doesNotMatch(flow,/copy-paste myself|me copier-coller|wiederhole mich lieber nicht/);
console.log('Italian cuisine and romantic preference preserved across Yoff and accepted Dakar-wide search; unrelated cuisine excluded; copy-paste wording removed.');
