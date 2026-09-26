import assert from 'node:assert/strict';
import { buildUserContext } from '../src/ai/buildUserContext.js';
import { applyLocationPolicy, locationPolicy, outsideLocationNotice } from '../src/logic/locationPolicy.js';
import { needsClarification } from '../src/logic/needsClarification.js';
import { selectBestPlace, findMatchingCandidates } from '../src/logic/selectBestPlace.js';
import { hydrateSearchProfile } from '../src/logic/searchProfileCompatibility.js';
import { contextForNewSearch } from '../src/logic/searchSession.js';
import type { Place } from '../src/types/place.js';
import type { UserContext } from '../src/types/userContext.js';
delete process.env.OPENAI_API_KEY;
function place(name: string, neighbourhood: string, focus: string, vibe = ''): Place {
 return { id: name, name, country: 'Senegal', region: 'Dakar', neighbourhood,
 categories: [focus === 'padel' ? 'sports' : 'food'], subcategories: [{id:focus,name:focus,displayOrder:0,images:[]}],
 shortDescription: focus, vibeTags: vibe ? [vibe] : [], vibe, offscriptPickLevel: 2, offscriptPriority: 10,
 audienceTags: [], occasionTags: [], dietaryTags: [], amenities: [], bestFor: [], notIdealFor: [], travellerTypes: [],
 childFriendly: false, bestTiming: [], closedDays: [], reservationNeeded: false, googleMapsUrl: 'https://example.test',
 guideAvailable: false, guideLanguages: [], images: [], status: 'ready' };
}
const restaurants=[place('Romantic Italian','Yoff','italian_food','romantic'),place('Other Italian','Ngor','italian_food')];
const padel=place('Fictional padel club','Ngor','padel');
let first=await buildUserContext({message:'I am looking for a romantic Italian restaurant'});
let location=await buildUserContext({message:'Yoff',previousContext:first.context,previousAssistantMessage:'Which neighbourhood are you in right now?'});
assert.equal(location.context.currentLocation,'Yoff');
assert.equal(locationPolicy(location.context).requiredRegion,undefined);
assert.equal(location.context.targetRegion,undefined,'A known hotel neighbourhood is not a default search target');
assert.equal(location.context.searchProfile?.neighbourhood,undefined);
const thanks=await buildUserContext({message:'Dank je',previousContext:location.context});
const next=await buildUserContext({message:'ik wil daarvoor padel spelen maar waar?',previousContext:thanks.context,previousAssistantMessage:'Graag gedaan 😊'});
assert.equal(next.context.currentLocation,'Yoff');
assert.equal(next.context.intent,'sports');
assert.equal(next.context.vibe,undefined,'Restaurant vibe must not carry into padel');
assert.deepEqual(next.context.searchProfile?.products,['padel']);
assert.deepEqual(next.context.searchProfile?.vibes,[]);
assert.equal(needsClarification(next.context,[...restaurants,padel]),null);
assert.equal(selectBestPlace([...restaurants,padel],next.context)?.place.id,padel.id);
const restored={...next.context,searchProfile:hydrateSearchProfile(JSON.parse(JSON.stringify(next.context.searchProfile)),next.context)};
assert.deepEqual(locationPolicy(restored),locationPolicy(next.context));
assert.equal(contextForNewSearch(location.context,'nl').currentLocation,'Yoff');
for(const message of ['padel in Yoff','padel alleen in Yoff','padel near me','padel on walking distance','padel, geen taxi']){
 const result=await buildUserContext({message,previousContext:location.context});
 assert.equal(locationPolicy(result.context).requiredRegion,'Yoff',message);
 assert.equal(findMatchingCandidates([padel],result.context).length,0,message);
}
for(const message of ['I am looking for padel in Ngor','Ik zoek padel in Ngor','Je cherche du padel à Ngor']){
 const result=applyLocationPolicy(message,next.context,location.context);
 assert.equal(result.currentLocation,'Yoff',message);
 assert.equal(locationPolicy(result).requiredRegion,'Ngor',message);
}
const moved=applyLocationPolicy('Ik ben nu in Ngor',next.context,location.context);
assert.equal(moved.currentLocation,'Ngor');
assert.equal(locationPolicy(moved).requiredRegion,undefined);
const hard=applyLocationPolicy('padel alleen in Yoff',next.context,location.context);
const broad=await buildUserContext({message:'okay',previousContext:hard,previousAssistantMessage:'Would you be open to another Dakar neighbourhood?'});
assert.equal(broad.context.currentLocation,'Yoff');
assert.equal(locationPolicy(broad.context).requiredRegion,undefined);
assert.equal(selectBestPlace([padel],broad.context)?.place.id,padel.id);
const qr: UserContext={language:'en',currentLocation:'Yoff'};
const qrSearch=await buildUserContext({message:'I want to play padel',previousContext:qr});
assert.equal(needsClarification(qrSearch.context,[padel]),null);
assert.equal(selectBestPlace([padel],qrSearch.context)?.place.id,padel.id);
const unknown=await buildUserContext({message:'I want to play padel'});
assert.equal(needsClarification(unknown.context,[padel]),null,'One strong match does not require a location form');
const nearbyUnknown=await buildUserContext({message:'padel near me'});
assert.equal(needsClarification(nearbyUnknown.context,[padel]),null,'TUUTI never asks for a neighbourhood');
assert.equal(findMatchingCandidates([padel],nearbyUnknown.context).length,0);
const nearby=place('Nearby padel','Yoff','padel');
assert.equal(selectBestPlace([padel,nearby],next.context)?.place.id,padel.id,'Stored neighbourhood does not affect an ordinary search');
const explicitNearby=await buildUserContext({message:'padel near me',previousContext:location.context});
assert.equal(selectBestPlace([padel,nearby],explicitNearby.context)?.place.id,nearby.id,'Explicit nearby requests use the stored neighbourhood');
const wrongLocal=place('Nearby restaurant','Yoff','italian_food');
assert.equal(selectBestPlace([wrongLocal,padel],next.context)?.place.id,padel.id,'Locality never substitutes cuisine for sport');
console.log('Location context checks passed: restaurant → thanks → padel; QR; stored policy; nearby ranking; explicit limits; origin vs destination; relocation; broadening; unknown location.');

const destinationOnly = applyLocationPolicy('padel in Ngor', {language:'en'});
assert.equal(locationPolicy(destinationOnly).currentRegion, undefined);
const destinationRestored = applyLocationPolicy('thanks', destinationOnly, destinationOnly);
assert.equal(locationPolicy(destinationRestored).currentRegion, undefined);
const locatedNearby = applyLocationPolicy('Yoff', nearbyUnknown.context, nearbyUnknown.context, 'Where are you?');
assert.equal(locationPolicy(locatedNearby).requiredRegion, 'Yoff');
for (const answer of ['zeker!', 'geen probleem', 'no problem', 'bien sûr']) {
 const widened = applyLocationPolicy(answer, hard, hard, 'Would you be open to another Dakar neighbourhood?');
 assert.equal(locationPolicy(widened).requiredRegion, undefined, answer);
}

assert.equal(outsideLocationNotice(next.context, 'Ngor'),undefined,'Ordinary travel across Dakar needs no warning');
assert.match(outsideLocationNotice(explicitNearby.context, 'Ngor') ?? '', /Ngor.*Yoff/);
assert.equal(outsideLocationNotice({ language: 'en' }, 'Ngor'), undefined);

const withoutPreviousReply = await buildUserContext({message: 'padel in Ngor', previousAssistantMessage: null});
assert.equal(locationPolicy(withoutPreviousReply.context).requiredRegion, 'Ngor');

const invitedContext: UserContext={...location.context,feedbackInvitationShown:true,feedbackAcceptedPlaceId:'00000000-0000-4000-8000-000000000001'};
const sameFlow=await buildUserContext({message:'iets rustiger graag',previousContext:invitedContext});
assert.equal(sameFlow.context.feedbackInvitationShown,true,'Feedback invitation state survives within a recommendation flow');
const freshFlow=await buildUserContext({message:'ik wil nu padel spelen',previousContext:invitedContext});
assert.equal(freshFlow.recommendationAction,'new_search');
assert.equal(freshFlow.context.feedbackInvitationShown,undefined,'A genuinely new search may show one new invitation');
