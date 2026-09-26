import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as logic from '../src/logic/recommendationFeedback.ts';
import { feedbackAspects } from '../src/ai/interpretPlaceFeedback.ts';
import { startsNewSearch } from '../src/logic/searchSession.ts';
const source=stripTypeScriptTypes(readFileSync(new URL('../src/logic/chatbotFlow.ts',import.meta.url),'utf8'));
async function scenario(rating,initial,hasDetail=false,{offline=false,followup='De pizza was fantastisch en we zaten gezellig buiten.',departure=false,skip=false}={}) {
  const records=[];let pending=null,turn=0,last='Pizzammore',savedContext={language:'nl',intent:'food'};
  const aspects=[{aspect:'food',sentiment:'positive',evidence:'pizza was fantastisch'},{aspect:'atmosphere',sentiment:'positive',evidence:'gezellig buiten'}];
  const mocks={...logic,feedbackAspects,startsNewSearch,
    getConversationContext:async()=>savedContext,getLastOutgoingMessage:async()=>last,
    getLastRecommendedPlace:async()=>({placeId:'p',placeName:'Pizzammore'}),getWhatsAppUser:async()=>null,
    isOffscriptStartMessage:()=>false,isResetCommand:()=>false,
    listFeedbackPlaces:async()=>[{id:'p',name:'Pizzammore'},{id:'11',name:'11 Players'}],getPendingRecommendationFeedback:async()=>pending,
    resolveConversationLanguage:()=> 'nl',upsertConversationContext:async(_,context)=>{savedContext=context},
    interpretPlaceFeedback:async input=>{
      if(offline)return null;
      if(turn){assert.equal(input.activePlace.id,'p');assert.equal(input.pendingRating,rating)}
      return {isFeedback:!departure||!turn,ambiguousPlace:false,followUpAction:turn?(departure?'new_request':skip?'skip':'detail'):'none',feedback:turn&&(departure||skip)?[]:[{placeId:'p',rating,reason:'food_drinks',evidence:input.message,detailEvidence:hasDetail||turn?input.message:'',aspects:hasDetail||turn?aspects:[]}]};
    },
    createRecommendationFeedback:async input=>{records.push({...input});if(!input.complete)pending={id:'f',placeId:'p',placeName:'Pizzammore',rating}},
    completeRecommendationFeedback:async(id,detail,structured)=>{assert.equal(id,'f');records[0].detail=detail;records[0].aspects=structured;records[0].complete=true;pending=null},
    closePendingFeedbackConversation:async()=>{pending=null;records[0].closed=true},
    listRecommendationPlaces:async()=>[],buildSubcategoryTaxonomy:()=>[],
    buildUserContext:async()=>{throw Error('new request reached normal routing')}
  };
  const module=new vm.SourceTextModule(source);
  await module.link(specifier=>{
    const names=[...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)].filter(m=>m[2]===specifier).flatMap(m=>m[1].split(',').map(x=>x.trim().split(/\s+as\s+/)[0]).filter(Boolean));
    return new vm.SyntheticModule(names,function(){for(const name of names)this.setExport(name,mocks[name]??(()=>false))});
  });await module.evaluate();
  const first=await module.namespace.runChatbotFlow('test',initial);last=first.message;
  assert.equal(records.length,1);assert.equal(records[0].rating,rating);
  if(hasDetail||rating==='did_not_go'){assert.match(first.message,/bewaard/);assert.equal(pending,null);return}
  assert.match(first.message,/Pizzammore.*\?|\?.*Pizzammore/);assert.doesNotMatch(first.message,/bewaard/);
  assert.equal(records[0].complete,false);turn++;
  if(departure){await assert.rejects(module.namespace.runChatbotFlow('test',followup),/normal routing/);assert.equal(pending,null);assert.equal(records[0].detail,undefined);return}
  const second=await module.namespace.runChatbotFlow('test',followup);
  assert.equal(records.length,1,'Detail updates existing rating instead of creating another');
  assert.equal(records[0].detail,followup);assert.equal(records[0].complete,true);assert.equal(pending,null);
  assert.match(second.message,/feedback over Pizzammore bewaard/);assert.doesNotMatch(second.message,/\?/);
  if(!offline&&!skip)assert.deepEqual(records[0].aspects,{food:'positive',atmosphere:'positive',service:'unknown',value:'unknown'});
}
for(const [rating,message] of [['loved','Pizzammore was echt geweldig!'],['okay','Pizzammore was goed.'],['disliked','Pizzammore viel tegen.']])await scenario(rating,message);
await scenario('loved','Pizzammore was geweldig, supergoede pizza en heel gezellige sfeer.',true);
await scenario('did_not_go','Niet geweest');
await scenario('loved','Pizzammore was geweldig',false,{skip:true,followup:'Geen idee, gewoon alles!'});
await scenario('loved','Pizzammore was geweldig',false,{departure:true,followup:'Ik wil nu padel spelen'});
await scenario('loved','Pizzammore was geweldig',false,{departure:true,followup:'Een goede padelclub'});
await scenario('loved','Pizzammore was geweldig',false,{departure:true,followup:'11 players'});
await scenario('loved','Ik vond het geweldig',false,{offline:true});
await scenario('loved','Ik vond het geweldig',false,{offline:true,departure:true,followup:'padel'});
console.log('Feedback follow-up: generic positive/neutral/negative, detailed review, one question, same record, structured aspects, skip, changed topic and offline fallback passed.');
