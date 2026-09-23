import assert from 'node:assert/strict';
import { emptyEvent } from '../src/logic/eventImport.js';
import { isStoredEventRequest, selectPublishedEvents, formatPublishedEvents, formatPublishedEventMessages, eventWhatsAppUrl, cleanEventSourceUrl } from '../src/logic/publishedEvents.js';
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
for(const detail of ['New studio','Ngor','Dakar',event.googleMapsUrl,'https://wa.me/221123456789','Consumption required','Kindvriendelijk']) assert.ok(reply.includes(detail));
assert.ok(!reply.includes('verificationNotes'));
assert.equal(currentEventDateRange('Wat te doen morgen?',now).start,'2026-09-24');
assert.equal(currentEventDateRange('Que faire samedi ?',now).start,'2026-09-26');
assert.equal(currentEventDateRange('events this weekend',now).end,'2026-09-27');
assert.equal(currentEventDateRange('events 2026-10-10',now).start,'2026-10-10');
console.log('Published event filtering, location output and date ranges passed.');

assert.ok(reply.includes('zaterdag 26 september 2026'));
assert.ok(reply.includes('💰 Prijs: Free'));
assert.ok(reply.includes('\n\n📍 New studio'));
assert.equal(formatPublishedEventMessages([event,event],'nl').length,2);
assert.ok(!formatPublishedEventMessages([event,event],'nl')[1].includes('Dit staat op de agenda'));
assert.ok(formatPublishedEvents([event],'de').includes('Preis:'));
assert.equal(eventWhatsAppUrl('+221 77 373 84 11'),'https://wa.me/221773738411');
assert.equal(eventWhatsAppUrl('00221 77 373 84 11'),'https://wa.me/221773738411');
assert.equal(eventWhatsAppUrl('221773738411'),'https://wa.me/221773738411');
assert.equal(eventWhatsAppUrl('77 373 84 11'),null);
assert.equal(eventWhatsAppUrl('not a number'),null);
assert.equal(cleanEventSourceUrl('https://www.instagram.com/cafedesartistes_dakar?utm_source=ig_web_button_share_sheet&igshid=abc'), 'https://www.instagram.com/cafedesartistes_dakar');
assert.equal(cleanEventSourceUrl('https://example.com/event?id=12&utm_source=x'), 'https://example.com/event?id=12');
console.log('Event layout, translated date labels and WhatsApp link checks passed.');
