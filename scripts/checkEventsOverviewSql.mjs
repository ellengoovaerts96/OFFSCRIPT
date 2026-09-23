// Run with node --experimental-vm-modules --import tsx scripts/checkEventsOverviewSql.mjs.
// Requires @electric-sql/pglite (or PGLITE_MODULE pointing to a temporary installation).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as logic from '../src/logic/eventImport.ts';
import * as recurrence from '../src/logic/eventRecurrence.ts';
import * as crypto from 'node:crypto';
import {renderEventsList} from '../src/logic/eventsAdminHtml.ts';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
try {
  await db.exec(`CREATE TABLE public.places (id UUID PRIMARY KEY, name text, neighbourhood text, area text, google_maps_url text, reservation_phone text);`);
  for(const file of ['060_events_admin.sql','061_event_venues_publication.sql']) await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const pool={query:(sql,params)=>db.query(sql,params)};
  const module=new vm.SourceTextModule(stripTypeScriptTypes(await readFile(new URL('../src/data/eventsRepository.ts',import.meta.url),'utf8')));
  await module.link(async name=>{
    const values=name.includes('postgres')?{pool}:name==='node:crypto'?crypto:name.includes('eventRecurrence')?recurrence:logic;
    return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value)});
  });
  await module.evaluate();
  const {listAdminEvents,getAdminEvent,listPublishedEvents}=module.namespace;
  assert.deepEqual(await listAdminEvents(),[]);
  const today=new Date().toISOString().slice(0,10);
  const fixtures=[
    {...logic.emptyEvent(),title:'One-time event',eventDate:today,status:'published',venueName:'Prieto'},
    {...logic.emptyEvent(),title:'Weekly event',eventDate:'2020-01-01',status:'published',venueName:'Boma',recurrenceFrequency:'weekly',recurrenceWeekday:String(new Date().getUTCDay())},
    {...logic.emptyEvent(),title:'Unscheduled draft'}
  ];
  const ids=[];
  for(const data of fixtures){const result=await db.query('INSERT INTO public.events(title,event_date,status,details,created_by) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING id',[data.title,data.eventDate,data.status,JSON.stringify(data),'test']);ids.push(result.rows[0].id)}
  const events=await listAdminEvents();
  assert.deepEqual(events.map(e=>e.data.title),fixtures.map(e=>e.title));
  assert.equal(events[0].data.eventDate,today);assert.equal(events[2].data.eventDate,null);
  for(let i=0;i<ids.length;i++)assert.equal((await getAdminEvent(ids[i])).data.eventDate,fixtures[i].eventDate);
  const page=renderEventsList(events);for(const fixture of fixtures)assert.ok(page.includes(fixture.title));
  const published=await listPublishedEvents(today,today);
  assert.equal(published.length,2);assert.ok(published.every(event=>event.eventDate===today));
  console.log('PostgreSQL event overview regression passed: empty list, ordering, dates, drafts, detail pages and weekly occurrences.');
}finally{await db.close()}
