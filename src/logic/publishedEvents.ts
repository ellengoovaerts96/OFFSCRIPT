import { normalizePlacePhone } from "./placePhone.js";
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
const translations = {
  nl:{intro:'Dit staat op de agenda:',price:'Prijs',conditions:'Voorwaarden',children:'Kindvriendelijk',reservation:'Reserveren verplicht',maps:'Locatie',source:'Meer info',phone:'Telefoon',weekly:'Wekelijks',fallback:'Vertaling tijdelijk niet beschikbaar; hieronder staat de oorspronkelijke tekst.'},
  fr:{intro:'Voici les événements à venir :',price:'Tarif',conditions:'Conditions',children:'Adapté aux enfants',reservation:'Réservation obligatoire',maps:'Lieu',source:'Plus d’infos',phone:'Téléphone',weekly:'Chaque semaine',fallback:'Traduction temporairement indisponible ; voici le texte original.'},
  en:{intro:'Upcoming events:',price:'Price',conditions:'Conditions',children:'Child friendly',reservation:'Reservation required',maps:'Location',source:'More info',phone:'Phone',weekly:'Weekly',fallback:'Translation temporarily unavailable; the original text follows.'},
  de:{intro:'Das steht auf dem Programm:',price:'Preis',conditions:'Bedingungen',children:'Kinderfreundlich',reservation:'Reservierung erforderlich',maps:'Standort',source:'Mehr Infos',phone:'Telefon',weekly:'Wöchentlich',fallback:'Die Übersetzung ist vorübergehend nicht verfügbar; hier ist der Originaltext.'}
};
export function eventWhatsAppUrl(phone:string): string | null {
  try {
    const compact=phone.replace(/[\s().-]/g,'');
    const normalized=normalizePlacePhone(/^221\d{9}$/.test(compact)?'+'+compact:phone);
    return normalized?'https://wa.me/'+normalized.slice(1):null;
  } catch { return null; }
}
export function cleanEventSourceUrl(value:string):string {
  try {
    const url=new URL(value);
    for(const key of [...url.searchParams.keys()]) if(/^utm_/i.test(key)||['igsh','igshid','fbclid','gclid'].includes(key))url.searchParams.delete(key);
    return url.href;
  } catch {return value}
}
export function formatPublishedEventMessages(events:EventData[], language:string, unavailable=false):string[] {
  const locale=language.slice(0,2) as keyof typeof translations;
  const words=translations[locale] ?? translations.fr;
  return events.map((event,index)=>{
    const date=event.eventDate ? new Intl.DateTimeFormat(translations[locale]?locale:'fr',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Africa/Dakar'}).format(new Date(event.eventDate+'T12:00:00Z')) : '';
    const whatsapp=eventWhatsAppUrl(event.contactPhone);
    const info=[event.price?'💰 '+words.price+': '+event.price:'',event.conditions?words.conditions+': '+event.conditions:'',event.childFriendly==='yes'?'👨‍👩‍👧 '+words.children:'',event.reservationRequired==='yes'?'🎟 '+words.reservation:''].filter(Boolean).join('\n');
    const links=[event.googleMapsUrl?'📍 '+words.maps+': '+event.googleMapsUrl:'',whatsapp?'💬 WhatsApp: '+whatsapp:event.contactPhone?'📞 '+words.phone+': '+event.contactPhone:'',event.sourceUrl?words.source+': '+cleanEventSourceUrl(event.sourceUrl):''].filter(Boolean).join('\n');
    return [index===0?words.intro:'',unavailable?words.fallback:'',`*${event.title}*`,
      ['📅 '+date, event.startTime?'🕒 '+event.startTime+(event.endTime?'–'+event.endTime:''):'',event.recurrenceFrequency==='weekly'?'↻ '+words.weekly:''].filter(Boolean).join('\n'),
      '📍 '+[...new Set([event.venueName,event.neighbourhood,event.area].filter(Boolean))].join(' — '),
      event.description,info,links].filter(Boolean).join('\n\n');
  });
}
export function formatPublishedEvents(events:EventData[],language:string):string {
  return formatPublishedEventMessages(events,language).join('\n\n──────────\n\n');
}
