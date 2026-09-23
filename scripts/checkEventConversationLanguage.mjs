import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import * as language from '../src/ai/detectLanguage.ts';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
async function load(path,resolve){
 const module=new vm.SourceTextModule(stripTypeScriptTypes(await readFile(new URL(path,import.meta.url),'utf8')));
 await module.link(async name=>{const values=resolve(name);return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value)})});
 await module.evaluate();return module.namespace;
}
try {
 await db.exec(`CREATE TABLE conversation_context(user_phone TEXT PRIMARY KEY, language TEXT, current_location TEXT, budget TEXT, clarification_count INT DEFAULT 0, updated_at TIMESTAMP DEFAULT NOW());
 INSERT INTO conversation_context(user_phone,language,current_location,budget,clarification_count) VALUES('test','fr','Yoff','low',2);`);
 const repository=await load('../src/data/conversationContextRepository.ts',name=>name.includes('postgres')?{pool:{query:(sql,params)=>db.query(sql,params)}}:{hydrateSearchProfile:()=>({})});
 const getContext=async phone=>(await db.query('SELECT * FROM conversation_context WHERE user_phone=$1',[phone])).rows[0] ?? null;
 const helper=await load('../src/logic/eventConversationLanguage.ts',name=>name.includes('detectLanguage')?language:{getConversationContext:getContext,upsertConversationLanguage:repository.upsertConversationLanguage});
 assert.equal(await helper.rememberEventLanguage('test','Wat is er te doen deze week in Dakar?'),'nl');
 let saved=await getContext('test');assert.equal(saved.language,'nl');assert.equal(saved.current_location,'Yoff');assert.equal(saved.budget,'low');assert.equal(saved.clarification_count,2);
 assert.equal(language.resolveConversationLanguage('Top!',saved.language),'nl');
 assert.equal(language.resolveConversationLanguage('Oké',saved.language),'nl');
 assert.equal(await helper.rememberEventLanguage('test','Events?'),'nl');
 assert.equal(await helper.rememberEventLanguage('test','What is there to do this week in Dakar?'),'en');
 saved=await getContext('test');assert.equal(language.resolveConversationLanguage('Great!',saved.language),'en');
 assert.equal(await helper.rememberEventLanguage('new','Wat is er dit weekend te doen in Dakar?'),'nl');assert.equal((await getContext('new')).language,'nl');
 assert.equal(await helper.rememberEventLanguage('test','evenementen in het Nederlands'),'nl');
 console.log('Event language regression passed: French → Dutch event → Top!, short follow-ups, English switch, new users and preserved preferences.');
}finally{await db.close()}
