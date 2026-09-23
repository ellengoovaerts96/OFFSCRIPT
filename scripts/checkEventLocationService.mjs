import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import * as grounding from '../src/logic/eventLocationLookup.ts';
import * as eventLogic from '../src/logic/eventImport.ts';
import * as drafts from '../src/logic/eventImportDraft.ts';
import * as html from '../src/logic/eventsAdminHtml.ts';
import * as auth from '../src/middleware/adminBasicAuth.ts';
import * as formats from 'openai/helpers/zod';
async function moduleFrom(path,resolve){
  const module=new vm.SourceTextModule(stripTypeScriptTypes(await readFile(new URL(path,import.meta.url),'utf8')));
  await module.link(async name=>{const values=resolve(name);return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value)})});
  await module.evaluate();return module.namespace;
}
let calls=[],available=true,fail=false;
const source='https://example.com/contact';
const openai={hasOpenAIKey:()=>available,openaiModel:'test-model',getOpenAIClient:()=>({responses:{parse:async args=>{
  calls.push(args);if(fail)throw new Error('service unavailable');
  return {output_parsed:{matched:true,venueName:'Boma',address:'Dakar',explanation:'Verify',suggestions:[{field:'area',value:'Almadies',sourceUrl:source,evidence:'The venue contact page.'}]},output:[{type:'web_search_call',action:{type:'search',sources:[{url:source}]}}]};
}}})};
const service=await moduleFrom('../src/ai/findEventLocation.ts',name=>name.includes('helpers/zod')?formats:name.includes('integrations/openai')?openai:grounding);
const input=grounding.validateLocationLookupInput({venueName:'Boma',missingFields:['area']});
assert.equal((await service.findEventLocation(input)).suggestions[0].value,'Almadies');
assert.equal(calls[0].tool_choice,'required');assert.equal(calls[0].tools[0].type,'web_search');
available=false;await assert.rejects(service.findEventLocation(input),/not configured/);available=true;
const routes=new Map(),middleware=[];let writes=0;
const repository={getAdminEvent:async()=>null,listAdminEvents:async()=>[],listEventVenues:async()=>[],saveAdminEvent:async()=>{writes++;return 'unused'}};
const router={use:fn=>middleware.push(fn),get:()=>{},post:(path,...handlers)=>routes.set(path,handlers)};
const multer=()=>({single:()=>()=>{}});multer.memoryStorage=()=>({});
await moduleFrom('../src/channels/eventsAdmin.ts',name=>{
  if(name==='express')return {Router:()=>router};if(name==='multer')return {default:multer};
  if(name.includes('adminBasicAuth'))return auth;if(name.includes('cloudinary'))return {cloudinaryConfigured:()=>true,uploadEventScreenshot:async()=>{throw new Error('Unexpected upload')}};
  if(name.includes('integrations/openai'))return openai;if(name.includes('extractEventScreenshot'))return {extractEventScreenshot:async()=>{throw new Error('Unexpected extraction')}};
  if(name.includes('findEventLocation'))return service;if(name.includes('eventLocationLookup'))return grounding;
  if(name.includes('eventsRepository'))return repository;if(name.includes('eventImportDraft'))return drafts;
  if(name.includes('eventsAdminHtml'))return html;return eventLogic;
});
process.env.INBOX_USERNAME='test';process.env.INBOX_PASSWORD='lookup-test-password';
async function request(body,authorized=true){
  const req={body,headers:{authorization:authorized?'Basic '+Buffer.from('test:lookup-test-password').toString('base64'):''}};
  const res={statusCode:200,status(value){this.statusCode=value;return this},json(value){this.body=value;return this},send(value){this.body=value;return this},setHeader(){}};
  for(const handler of [...middleware,...routes.get('/location-lookup')]){
    let next=false;await handler(req,res,()=>{next=true});if(!next)break;
  }
  return res;
}
const payload={...input,_csrf:auth.adminCsrfToken()};
assert.equal((await request(payload,false)).statusCode,401);
assert.equal((await request({...payload,_csrf:'bad'})).statusCode,403);
assert.equal((await request({...payload,venueName:''})).statusCode,400);
assert.equal((await request(payload)).body.suggestions[0].value,'Almadies');
fail=true;
const originalError=console.error;console.error=()=>{};
try{assert.equal((await request(payload)).statusCode,503)}finally{console.error=originalError}
assert.equal(writes,0);
console.log('Location lookup service and route: web grounding, auth, CSRF, validation, errors and no database writes passed.');

// Execute the emitted browser script with a small DOM: preserve edits and require an explicit click per proposal.
class Element {
  constructor(){this.value='';this.checked=true;this.listeners={};this.children=[];this.style={};this.dataset={};this.disabled=false;this._text=''}
  set textContent(value){this._text=value;this.children=[]} get textContent(){return this._text}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn)}
  async trigger(name){for(const fn of this.listeners[name]??[])await fn()}
  replaceChildren(){this.children=[];this._text=''}
  append(...items){this.children.push(...items)}
}
const form={elements:{}};
for(const name of [...Object.keys(eventLogic.emptyEvent()),'_csrf','reviewed'])form.elements[name]=new Element();
form.elements.venueName.value='Boma';form.elements.area.value='Existing area';form.elements._csrf.value='test';
const select=new Element();select.selectedOptions=[new Element()];select.closest=()=>form;
const button=new Element(),results=new Element();
const elements={'venue-select':select,'location-lookup':button,'location-results':results};
let sent,resolveSearch;
let search=async options=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({venueName:'Boma',address:'Dakar',explanation:'Verify',suggestions:[
  {field:'neighbourhood',value:'Ngor',sourceUrl:source,evidence:'Published neighbourhood'},
  {field:'contactPhone',value:'+221 123456789',sourceUrl:source,evidence:'Published phone'}
]})}};
const rendered=html.renderEventReview({csrf:'test',source:null,extraction:null,context:{month:null,year:null,publicationDate:null},venues:[]});
const script=[...rendered.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
vm.runInNewContext(script,{document:{getElementById:id=>elements[id],createElement:()=>new Element()},fetch:async(_url,options)=>search(options),AbortController,setTimeout,clearTimeout});
await button.trigger('click');
assert.ok(!sent.missingFields.includes('area'));
assert.equal(form.elements.neighbourhood.value,'');
assert.equal(form.elements.area.value,'Existing area');
const cards=results.children.filter(child=>child.className==='notice warning');
await cards[0].children.at(-1).trigger('click');
assert.equal(form.elements.neighbourhood.value,'Ngor');assert.ok(form.elements.verificationNotes.value.includes(source));assert.equal(form.elements.reviewed.checked,false);
form.elements.contactPhone.value='Manually entered phone';
await cards[1].children.at(-1).trigger('click');assert.equal(form.elements.contactPhone.value,'Manually entered phone');
form.elements.contactPhone.value='';
search=()=>new Promise(resolve=>{resolveSearch=resolve});
const pending=button.trigger('click');
form.elements.venueName.value='Another venue';await form.elements.venueName.trigger('input');
resolveSearch({ok:true,json:async()=>({suggestions:[{field:'contactPhone',value:'old venue phone'}]})});
await pending;
assert.equal(results.children.length,0);assert.equal(form.elements.contactPhone.value,'');assert.equal(button.disabled,false);
console.log('Browser lookup: explicit acceptance, source notes, existing values and stale response protection passed.');
