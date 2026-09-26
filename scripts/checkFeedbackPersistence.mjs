import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import * as logic from '../src/logic/recommendationFeedback.ts';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
try {
  await db.exec('CREATE TABLE places(id uuid PRIMARY KEY); CREATE TABLE sources(id uuid PRIMARY KEY);');
  for(const file of ['050_recommendation_feedback.sql','051_positive_feedback_detail.sql','059_feedback_conversation_reset.sql','064_feedback_detail_aspects.sql'])await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  await db.exec('ALTER TABLE recommendation_feedback ADD COLUMN user_id uuid;');
  const module=new vm.SourceTextModule(stripTypeScriptTypes(await readFile(new URL('../src/data/recommendationFeedbackRepository.ts',import.meta.url),'utf8')));
  await module.link(specifier=>{
    const values=specifier.includes('recommendationFeedback.js')?logic:specifier.includes('whatsappUsersRepository')?{resolveUserIdentity:async()=>({userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})}:{pool:{query:(sql,args)=>db.query(sql,args)}};
    return new vm.SyntheticModule(Object.keys(values),function(){for(const[key,value]of Object.entries(values))this.setExport(key,value)});
  });await module.evaluate();const repo=module.namespace;
  for(const rating of ['loved','okay','disliked']) {
    await repo.createRecommendationFeedback({userPhone:rating,placeId:null,placeName:'Pizzammore',rating,context:{language:'nl'},freeText:'Initial evaluation'});
    const pending=await repo.getPendingRecommendationFeedback(rating);assert.equal(pending.placeName,'Pizzammore');assert.equal(pending.rating,rating);
    await repo.completeRecommendationFeedback(pending.id,'Pizza and terrace',{food:'positive',atmosphere:'positive',service:'unknown',value:'unknown'});
    assert.equal(await repo.getPendingRecommendationFeedback(rating),null);
    const row=(await db.query('SELECT * FROM recommendation_feedback WHERE id=$1',[pending.id])).rows[0];
    assert.equal(row.free_text,'Initial evaluation\nPizza and terrace');assert.equal(row.rating,rating);assert.equal(row.aspects.service,'unknown');assert.equal(row.aspects.food,'positive');assert.equal(row.awaiting_detail,false);assert.equal(row.conversation_closed,true);
    await repo.completeRecommendationFeedback(pending.id,'duplicate retry');
    assert.equal((await db.query('SELECT free_text FROM recommendation_feedback WHERE id=$1',[pending.id])).rows[0].free_text,row.free_text);
  }
  await repo.createRecommendationFeedback({userPhone:'detailed',placeId:null,placeName:'Pizzammore',rating:'disliked',context:{language:'nl'},freeText:'Poor service',complete:true});
  assert.equal(await repo.getPendingRecommendationFeedback('detailed'),null);
  await repo.createRecommendationFeedback({userPhone:'reset',placeId:null,placeName:'Pizzammore',rating:'okay',context:{language:'nl'}});
  await repo.closePendingFeedbackConversation('reset');assert.equal(await repo.getPendingRecommendationFeedback('reset'),null);
  // Migrations run again on every boot: completed conversations must stay closed.
  await db.exec(await readFile(new URL('../migrations/064_feedback_detail_aspects.sql',import.meta.url),'utf8'));
  assert.equal((await db.query('SELECT count(*)::int AS count FROM recommendation_feedback WHERE awaiting_detail=true')).rows[0].count,0);
  console.log('Feedback PostgreSQL persistence: pending ratings, exact text, aspects, completion, retry, reset and migration rerun passed.');
} finally {await db.close()}
