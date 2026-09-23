import assert from 'node:assert/strict';
import { emptyEvent } from '../src/logic/eventImport.js';
import { isStoredEventRequest, selectPublishedEvents, formatPublishedEvents } from '../src/logic/publishedEvents.js';
import { currentEventDateRange } from '../src/ai/findCurrentEvent.js';
const now = new Date('2026-09-23T14:00:00Z');
const event = {...emptyEvent(), title:'Pottery workshop',category:'Workshop',venueName:'New studio',neighbourhood:'Ngor',area:'Dakar',googleMapsUrl:'https://maps.google.com/?q=Ngor',contactPhone:'+221123456789',childFriendly:'yes' as const,status:'published' as const,eventDate:'2026-09-26',price:'Free',conditions:'Consumption required'};
assert.ok(isStoredEventRequest('Wat is er te doen?'));
assert.ok(isStoredEventRequest('Un atelier avec les enfants ce samedi ?'));
assert.ok(!isStoredEventRequest('Waar kan ik koffie drinken?'));
assert.deepEqual(selectPublishedEvents([event],'workshop met kinderen in Ngor',now),[event]);
for(const change of [{status:'draft' as const},{eventDate:'2026-09-19'},{childFriendly:'unknown' as const},{childFriendly:'no' as const},{neighbourhood:'Yoff'}]) {
  assert.equal(selectPublishedEvents([{...event,...change}],'workshop met kinderen in Ngor',now).length,0);
}
assert.equal(selectPublishedEvents([{...event,eventDate:'2026-09-23',startTime:'12:00',endTime:'13:00'}],'workshop',now).length,0);
assert.equal(selectPublishedEvents([{...event,eventDate:'2026-09-23',startTime:'23:00',endTime:'02:00'}],'workshop',now).length,1);
const reply = formatPublishedEvents([event],'nl');
for(const detail of ['New studio','Ngor','Dakar',event.googleMapsUrl,event.contactPhone,'Consumption required','Kindvriendelijk']) assert.ok(reply.includes(detail));
assert.ok(!reply.includes('verificationNotes'));
assert.equal(currentEventDateRange('Wat te doen morgen?',now).start,'2026-09-24');
assert.equal(currentEventDateRange('Que faire samedi ?',now).start,'2026-09-26');
assert.equal(currentEventDateRange('events this weekend',now).end,'2026-09-27');
assert.equal(currentEventDateRange('events 2026-10-10',now).start,'2026-10-10');
console.log('Published event filtering, location output and date ranges passed.');
