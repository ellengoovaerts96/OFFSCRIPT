// Offline integration test: real PostgreSQL semantics in PGlite, mocked Sheets and AI.
// PGLITE_MODULE may point to an isolated installation; no application database is used.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as logic from '../src/logic/fieldResearch.ts';
import * as locks from '../src/logic/editorialLocks.ts';
import * as extraction from '../src/services/fieldNotesExtraction.ts';
import { escapeHtml } from '../src/logic/sourcesAdminHtml.ts';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
async function moduleFrom(file, imports) {
  const source = stripTypeScriptTypes(await readFile(new URL('../src/'+file, import.meta.url), 'utf8'));
  const module = new vm.SourceTextModule(source);
  await module.link(name => {
    const values = imports[name];
    assert.ok(values, `Unexpected dependency: ${name}`);
    return new vm.SyntheticModule(Object.keys(values), function() {
      for (const [key,value] of Object.entries(values)) this.setExport(key,value);
    });
  });
  await module.evaluate();
  return module.namespace;
}
const query = async (sql, params) => {
  // PGlite is single-session; mimic the worker's session lock without external services.
  if(sql.includes('pg_try_advisory_lock')) return {rows:[{locked:true}]};
  if(sql.includes('pg_advisory_unlock')) return {rows:[]};
  return db.query(sql,params);
};
const pool = {query, connect:async()=>({query,release(){}})};
const count = async table => Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
try {
  for(const filename of ['001_initial_schema.sql','003_subcategory_images_and_image_limits.sql','005_stories_knowledge_base.sql','006_experiences_public_content.sql','009_places_experiences_exact_area_vibe.sql','010_places_social_links.sql','011_places_practical_info.sql','012_places_transport.sql','028_bilingual_place_content.sql','032a_create_field_research_raw.sql','033_places_source_row_id.sql','034_places_area.sql','035_bilingual_place_area.sql','036_places_vibe_tags.sql','037_places_editorial_curation.sql','039_places_editorial_ranking_v2.sql','040_places_numeric_price_level.sql','044_places_amenities.sql','054_places_dietary_tags.sql','055_places_editorial_locks_archive.sql','062_field_research_reviews.sql','062_field_research_reviews.sql']) {
    let sql=await readFile(new URL('../migrations/'+filename,import.meta.url),'utf8');
    sql=sql.replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');
    await db.exec(sql);
  }
  const repo=await moduleFrom('data/fieldResearchRepository.ts',{'../integrations/postgres.js':{pool},'../logic/fieldResearch.js':logic,'../logic/editorialLocks.js':locks});
  const html=await moduleFrom('logic/fieldResearchHtml.ts',{'./sourcesAdminHtml.js':{escapeHtml},'./fieldResearch.js':logic,'../data/fieldResearchRepository.js':repo});
  const base={place:'Test Café',entry_type:'place',country:'Senegal',region:'Dakar',neighbourhood:'Ngor',short_description_en:'A local café.',google_maps_url:'https://maps.example.test/cafe',child_friendly:'unknown',phone:'+221771234567',categories:'food_and_drink',subcategories:'lunch, lunch',price_level:'2',transport:'Walk from the road',why_hidden_gem:'Keep this original legacy field'};
  assert.equal(logic.fingerprint({a:1,b:2}),logic.fingerprint({b:2,a:1}));
  assert.equal(logic.mapResearchToPlace(base).why_hidden_gem,undefined); // renamed column; preserve only in raw.
  assert.throws(()=>logic.mapResearchToPlace({...base,google_maps_url:'javascript:alert(1)'}),/Invalid/);
  assert.throws(()=>logic.mapResearchToPlace({...base,authenticity:'9'}),/between/);
  assert.throws(()=>logic.reviewedInput({place:['bad']},base),/Invalid/);
  assert.equal(logic.matchingResearchPlaces(base,[{name:'Test Cafe',id:'x'}]).length,1);
  const raw={note:'Original notes, never replace',researcher:'Ellen'};
  const {rows:[inserted]}=await db.query("INSERT INTO field_research_inbox(source_key,source_row_id,source_type,raw,payload) VALUES('notes:test','test','field_notes',$1,$2) RETURNING id",[JSON.stringify(raw),JSON.stringify(base)]);
  let item=await repo.getResearch(String(inserted.id));
  assert.equal(item.status,'new');
  assert.deepEqual(item.placeMatches,[]);
  await assert.rejects(repo.approvalPreview(item,'create',null),/In review/);
  const edited=logic.reviewedInput({...base,short_description_en:'Reviewed café description'},base);
  await repo.saveResearch(item.id,0,repo.itemHash(item),edited,'in_review','editor');
  assert.equal(await count('places'),0);
  await assert.rejects(repo.saveResearch(item.id,0,repo.itemHash(item),edited,'in_review','editor'),/changed/);
  item=await repo.getResearch(item.id);
  const preview=await repo.approvalPreview(item,'create',null);
  assert.equal(await count('places'),0);
  process.env.INBOX_PASSWORD='offline-test-only';
  const signed=logic.signResearchPlan(preview.plan);
  assert.deepEqual(logic.readResearchPlan(signed),preview.plan);
  assert.throws(()=>logic.readResearchPlan(signed+'bad'),/Invalid/);
  assert.throws(()=>logic.readResearchPlan(logic.signResearchPlan({...preview.plan,expires:1})),/expired/);
  const placeId=await repo.approveResearch(preview.plan,[],'editor');
  const created=(await db.query('SELECT * FROM places WHERE id=$1',[placeId])).rows[0];
  assert.equal(created.status,'draft');
  assert.equal(created.child_friendly,null);
  assert.equal(created.name,'Test Café');
  assert.equal(created.short_description,'Reviewed café description');
  assert.equal(created.source_row_id,'test');
  assert.equal(created.reservation_phone,base.phone);
  assert.deepEqual(created.subcategories,['lunch']);
  assert.equal(await count('place_subcategories'),1);
  assert.ok(created.editorial_locked_fields.includes('short_description'));
  assert.deepEqual((await db.query('SELECT raw FROM field_research_inbox')).rows[0].raw,raw);
  assert.equal(await count('field_research_approvals'),1);
  const linked = await repo.getResearch(item.id);
  assert.equal(linked.placeMatches[0].confirmed,true);
  assert.ok(html.renderResearchList([linked],{},null,'csrf').includes('✓ Already in Places'));
  assert.ok(html.renderResearchDetail(linked,'csrf').includes('/admin/places/'+placeId));
  const {rows:[possibleRow]}=await db.query("INSERT INTO field_research_inbox(source_key,source_type,raw,payload) VALUES('test:possible','field_notes','{}',$1) RETURNING id",[JSON.stringify({place:'Test Cafe by Prainha'})]);
  const possible=await repo.getResearch(String(possibleRow.id));
  assert.equal(possible.placeMatches[0].id,placeId);
  assert.equal(possible.placeMatches[0].confirmed,false);
  assert.ok(html.renderResearchDetail(possible,'csrf').includes('Possible match in Places'));

  await assert.rejects(repo.approveResearch(preview.plan,[],'editor'),/already approved/);
  // Compare selected fields, preserve existing publication state, phone and image rows.
  await db.query("UPDATE places SET status='active' WHERE id=$1",[placeId]);
  await db.query("INSERT INTO place_images(place_id,url) VALUES($1,'https://images.example.test/original.jpg')",[placeId]);
  item=await repo.getResearch(item.id);
  await repo.saveResearch(item.id,item.version,repo.itemHash(item),{...edited,short_description_en:'Second review',phone:'+221779999999'},'in_review','editor');
  item=await repo.getResearch(item.id);
  await assert.rejects(repo.approvalPreview(item,'create',null),/exact name/);
  assert.equal((await repo.placeChoices(item)).length,1);
  const update=await repo.approvalPreview(item,'update',placeId);
  await repo.approveResearch(update.plan,['short_description','short_description_en'],'editor');
  const updated=(await db.query('SELECT * FROM places WHERE id=$1',[placeId])).rows[0];
  assert.equal(updated.short_description,'Second review');
  assert.equal(updated.reservation_phone,base.phone);
  assert.equal(updated.status,'active');
  assert.equal(await count('place_images'),1);
  item=await repo.getResearch(item.id);
  await repo.saveResearch(item.id,item.version,repo.itemHash(item),item.reviewed,'in_review','editor');
  item=await repo.getResearch(item.id);
  const stale=await repo.approvalPreview(item,'update',placeId);
  await db.query("UPDATE places SET region='Changed elsewhere' WHERE id=$1",[placeId]);
  await assert.rejects(repo.approveResearch(stale.plan,['region'],'editor'),/existing place changed/);
  assert.equal(await count('field_research_approvals'),2);
  // Subcategory edits preserve retained IDs/photos and never cascade-delete media.
  const subcategory=(await db.query('SELECT id FROM place_subcategories WHERE place_id=$1',[placeId])).rows[0].id;
  await db.query("INSERT INTO place_subcategory_images(place_subcategory_id,url) VALUES($1,'https://images.example.test/lunch.jpg')",[subcategory]);
  await repo.saveResearch(item.id,item.version,repo.itemHash(item),{...item.reviewed,subcategories:'lunch, dinner'},'in_review','editor');
  item=await repo.getResearch(item.id);
  await repo.approveResearch((await repo.approvalPreview(item,'update',placeId)).plan,['subcategories'],'editor');
  assert.equal((await db.query("SELECT id FROM place_subcategories WHERE name='lunch'")).rows[0].id,subcategory);
  assert.equal(await count('place_subcategory_images'),1);
  item=await repo.getResearch(item.id);
  await repo.saveResearch(item.id,item.version,repo.itemHash(item),{...item.reviewed,subcategories:'dinner'},'in_review','editor');
  item=await repo.getResearch(item.id);
  await assert.rejects(repo.approveResearch((await repo.approvalPreview(item,'update',placeId)).plan,['subcategories'],'editor'),/subcategory with photos/);
  assert.equal(await count('place_subcategory_images'),1);
  assert.deepEqual((await db.query('SELECT subcategories FROM places WHERE id=$1',[placeId])).rows[0].subcategories,['lunch','dinner']);
  const unsafe={...item,payload:{...item.payload,place:'<script>alert(1)</script>'},reviewed:{}};
  assert.ok(!html.renderResearchDetail(unsafe,'csrf').includes('<script>alert'));
  assert.ok(html.renderResearchList([item],{},null,'csrf').includes('Test Café'));
  assert.ok(html.renderResearchList([item],{q:'absent'},null,'csrf').includes('No matching submissions'));
  assert.ok(html.renderResearchApproval(item,stale,'csrf').includes('name="confirmed"'));

  // Background flow: actual mapping helpers, simulated Sheets/AI, real inbox DB.
  await db.query("INSERT INTO field_research_raw(source_row_id,place,region) VALUES('legacy-test','Legacy place','Dakar')");
  const legacyBefore=(await db.query('SELECT * FROM field_research_raw')).rows;
  let aiCalls=0,fail=false,environment='STAGING';
  const source=[['Timestamp','Note de terrain','Researcher','Status'],['24/09/2026 10:00:00','Form notes','Heidi','new']];
  const sheet=[['source_note_id','custom_column']];
  const requests=[];
  const google={auth:{JWT:class{}},sheets:()=>({spreadsheets:{values:{
    get:async({range})=>({data:{values:structuredClone(range.includes('Field Notes')?source:sheet)}}),
    update:async request=>{requests.push(request);if(request.range.includes('Structured Import'))sheet[0]=request.requestBody.values[0];else{const row=Number(request.range.match(/(\d+)$/)[1])-1;source[row][3]=request.requestBody.values[0][0]}return{}},
    append:async request=>{requests.push(request);sheet.push(request.requestBody.values[0]);return{}}
  }}})};
  const ai={...extraction,structureDraft:async()=>{
    aiCalls++;if(fail)throw new Error('Simulated unavailable AI');
    return {place_name:'New Note Café',entry_type:'place',country:'Senegal',region:'Dakar',categories:['food_and_drink'],subcategories:['lunch'],short_description_en:'From source',audience_tags:[],occasion_tags:[],dietary_tags:[],traveller_types:[],amenities:[],best_timing:[],review_notes:[],confidence:0.8};
  }};
  const sync=await moduleFrom('services/fieldResearchSync.ts',{'googleapis':{google},'../integrations/postgres.js':{pool},'./fieldNotesExtraction.js':ai,'../logic/dashboardConfig.js':{dashboardConfig:()=>({environment})}});
  for(const key of ['GOOGLE_FIELD_NOTES_SPREADSHEET_ID','GOOGLE_SERVICE_ACCOUNT_EMAIL','GOOGLE_PRIVATE_KEY','OPENAI_API_KEY'])process.env[key]='offline-test-only';
  await sync.syncFieldResearch();
  assert.equal(aiCalls,1);assert.equal(sheet.length,2);assert.equal(sheet[0][1],'custom_column');
  assert.equal(source[1][3],'ai_processed');assert.equal(await count('places'),1);
  assert.equal(sheet[1][sheet[0].indexOf('review_status')],'needs_review');
  let note=(await repo.listResearch()).find(item=>item.sourceId==='field-note:24/09/2026 10:00:00');
  assert.equal(note.payload.place,'New Note Café');assert.equal(note.raw['Note de terrain'],'Form notes');
  await repo.saveResearch(note.id,note.version,repo.itemHash(note),{place:'My correction'},'in_review','editor');
  await sync.syncFieldResearch();
  assert.equal(aiCalls,1);assert.equal(sheet.length,2);
  note=await repo.getResearch(note.id);assert.equal(repo.itemValues(note).place,'My correction');
  assert.deepEqual((await db.query('SELECT * FROM field_research_raw')).rows,legacyBefore);
  // If a Form row is removed later, keep the original note already captured in DB.
  const original=note.raw;source.pop();await sync.syncFieldResearch();
  assert.deepEqual((await repo.getResearch(note.id)).raw,original);
  // Repeated AI errors have cooldown, allowing following notes through.
  for(let i=1;i<=4;i++)source.push([`24/09/2026 11:00:0${i}`,'A failed note','Heidi','new']);
  fail=true;
  const oldError=console.error;console.error=()=>{};
  try{await sync.syncFieldResearch()}finally{console.error=oldError}
  assert.equal(aiCalls,4);fail=false;await sync.syncFieldResearch();assert.equal(aiCalls,5);
  assert.equal(sheet.length,3);assert.equal(await count('places'),1);
  assert.ok((await repo.listResearch()).filter(item=>item.error).length>=3);
  environment='PRODUCTION';await assert.rejects(sync.syncFieldResearch(),/staging only/);
  console.log('Field Research passed: schema, immutable raw data, editable review, approval gating, selective updates, stale review protection, provenance, HTML escaping, repeated sync, AI failures, and staging guard.');
} finally {await db.close()}
