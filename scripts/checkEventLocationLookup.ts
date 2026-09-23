import assert from 'node:assert/strict';
import { groundedLocationResult, validateLocationLookupInput } from '../src/logic/eventLocationLookup.js';
import { renderEventReview } from '../src/logic/eventsAdminHtml.js';
const source='https://example.com/contact';
const maps='https://maps.app.goo.gl/real-listing';
const raw={matched:true,venueName:'Boma',address:'Dakar',explanation:'Check the venue address',suggestions:[
  {field:'neighbourhood',value:'Ngor',sourceUrl:source,evidence:'The contact page states Ngor.'},
  {field:'contactPhone',value:'+221 78 731 18 18',sourceUrl:source,evidence:'Published venue phone.'},
  {field:'googleMapsUrl',value:maps,sourceUrl:source,evidence:'Venue listing.'}
]};
assert.equal(groundedLocationResult(raw,[source,maps],['neighbourhood','contactPhone','googleMapsUrl']).suggestions.length,3);
assert.equal(groundedLocationResult(raw,[source,maps],['area']).suggestions.length,0);
assert.equal(groundedLocationResult(raw,[],['neighbourhood']).suggestions.length,0);
assert.equal(groundedLocationResult(raw,['https://example.com/another-page'],['neighbourhood']).suggestions.length,0);
assert.equal(groundedLocationResult({...raw,matched:false},[source,maps],['neighbourhood']).suggestions.length,0);
assert.equal(groundedLocationResult(raw,[source],['googleMapsUrl']).suggestions.length,0);
for(const invalid of ['javascript:alert(1)','https://evil.example/maps','http://127.0.0.1/maps']) {
  const entry={field:'googleMapsUrl',value:invalid,sourceUrl:source,evidence:'x'};
  assert.equal(groundedLocationResult({...raw,suggestions:[entry]},[source,invalid],['googleMapsUrl']).suggestions.length,0);
}
assert.throws(()=>validateLocationLookupInput({venueName:'',missingFields:['area']}));
assert.throws(()=>validateLocationLookupInput({venueName:'Boma',missingFields:['password']}));
assert.throws(()=>validateLocationLookupInput({venueName:'Boma',missingFields:['area'],sourceUrl:'http://localhost/private'}));
assert.deepEqual(validateLocationLookupInput({venueName:'Boma',missingFields:['area']}).missingFields,['area']);
const html=renderEventReview({csrf:'test',source:null,extraction:null,context:{month:null,year:null,publicationDate:null},venues:[]});
assert.match(html,/type="button" class="secondary" id="location-lookup"/);
for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(script[1]);
console.log('Location lookup: field validation, exact citations, ambiguity, safe Maps URLs and browser script checks passed.');
