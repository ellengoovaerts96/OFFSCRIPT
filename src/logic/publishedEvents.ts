import type { EventData } from './eventImport.js';

const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function isStoredEventRequest(message: string): boolean {
  return /\b(wat.*te doen|wat (?:kan|kunnen).*doen|wat is er te doen|what.*to do|things to do|what is on|que faire|qu.est.ce qu.il y a|evenement\w*|events?|workshops?|ateliers?|concert\w*|festival\w*)\b/.test(normalize(message));
}
export function selectPublishedEvents(events: EventData[], message: string, now = new Date()): EventData[] {
  const query = normalize(message);
  const today = now.toISOString().slice(0,10); // Dakar is UTC year-round.
  const currentTime = now.toISOString().slice(11,16);
  const children = /\b(kinderen|kind|kids|children|child|enfants?|familie|family|famille)\b/.test(query);
  const workshops = /\b(workshops?|ateliers?)\b/.test(query);
  const music = /\b(concert\w*|music|muziek|musique)\b/.test(query);
  const areas = ['almadies','ngor','yoff','ouakam','plateau','medina','point e'];
  const requestedAreas = areas.filter(area => query.includes(area));
  const namedVenues = events.map(event => normalize(event.venueName)).filter(name => name.length > 2 && query.includes(name));
  return events.filter(event => event.status === 'published' && event.eventDate && event.eventDate >= today &&
    !(event.eventDate === today && (event.endTime || event.startTime) && !(event.endTime && event.startTime && event.endTime < event.startTime) && (event.endTime || event.startTime)! < currentTime) &&
    (!namedVenues.length || namedVenues.includes(normalize(event.venueName))) &&
    (!children || event.childFriendly === 'yes') &&
    (!workshops || /workshop|atelier/.test(normalize(event.category+' '+event.title+' '+event.description))) &&
    (!music || /concert|music|muziek|musique/.test(normalize(event.category+' '+event.title+' '+event.description))) &&
    (!requestedAreas.length || requestedAreas.some(area => normalize(event.neighbourhood+' '+event.area).includes(area))))
    .sort((a,b)=>(a.eventDate!+(a.startTime||'')).localeCompare(b.eventDate!+(b.startTime||''))).slice(0,3);
}
export function formatPublishedEvents(events: EventData[], language: string): string {
  const words = language === 'nl' ? ['Dit staat op de agenda:','Kindvriendelijk','Reserveren verplicht','Bron'] : language === 'fr' ? ['Voici les événements à venir :','Adapté aux enfants','Réservation obligatoire','Source'] : ['Upcoming events:','Child friendly','Reservation required','Source'];
  return words[0]+'\n\n'+events.map(event => [
    `*${event.title}*`, `${event.eventDate}${event.startTime ? ' · '+event.startTime : ''}${event.endTime ? '–'+event.endTime : ''}`,
    '📍 '+[...new Set([event.venueName,event.neighbourhood,event.area].filter(Boolean))].join(' — '),
    event.description, [event.price,event.conditions].filter(Boolean).join(' — '),
    event.childFriendly==='yes' ? words[1] : '', event.reservationRequired==='yes' ? words[2] : '',
    event.googleMapsUrl ? '🗺 '+event.googleMapsUrl : '', event.contactPhone ? '📞 '+event.contactPhone : '',
    event.sourceUrl ? words[3]+': '+event.sourceUrl : ''
  ].filter(Boolean).join('\n')).join('\n\n');
}
