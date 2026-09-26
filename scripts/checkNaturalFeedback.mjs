import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as feedbackLogic from '../src/logic/recommendationFeedback.ts';
import { feedbackAspects } from '../src/ai/interpretPlaceFeedback.ts';

const source = stripTypeScriptTypes(readFileSync(new URL('../src/logic/chatbotFlow.ts', import.meta.url), 'utf8'));
async function check({ ambiguous = false, fails = false, named = false, reset = false } = {}) {
  const writes = [];
  const cleared = [];
  const message = reset ? 'reset' : named ? 'Chez Mami was lekker, maar bij B was de bediening slecht.' : 'Lekker maar iets te pikant!';
  const context = vm.createContext({ console: { error() {} }, setTimeout, clearTimeout });
  const mocks = {
    ...feedbackLogic, feedbackAspects,
    getPendingRecommendationFeedback: async () => null,
    deleteConversationContext: async () => cleared.push('context'),
    deleteRecommendationHistoryForUser: async () => cleared.push('history'),
    closePendingFeedbackConversation: async () => cleared.push('pending-feedback'),
    upsertConversationContext: async () => {},
    buildOffscriptWelcomeResponse: () => 'Welcome',
    getConversationContext: async () => ({ language: 'nl', intent: 'food' }),
    getLastOutgoingMessage: async () => 'Chez Mami',
    getLastRecommendedPlace: async () => ({ placeId: 'a', placeName: 'Chez Mami' }),
    getWhatsAppUser: async () => null,
    isOffscriptStartMessage: () => false,
    isResetCommand: () => false,
    listFeedbackPlaces: async () => [{ id: 'a', name: 'Chez Mami' }, { id: 'b', name: 'B' }],
    interpretPlaceFeedback: async () => ({ ambiguousPlace: ambiguous, feedback: ambiguous ? [] : named ? [
      { placeId: 'a', rating: 'loved', reason: 'food_drinks', detailEvidence: 'lekker' },
      { placeId: 'b', rating: 'disliked', reason: 'something_else', detailEvidence: 'bediening slecht' }
    ] : [{ placeId: 'a', rating: 'okay', reason: 'food_drinks', detailEvidence: 'te pikant' }] }),
    resolveConversationLanguage: () => 'nl',
    createRecommendationFeedback: async value => { if (fails) throw Error('database failed'); writes.push(value); }
  };
  const module = new vm.SourceTextModule(source, { context });
  await module.link(specifier => {
    const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)].filter(m => m[2] === specifier);
    const names = imports.flatMap(m => m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean));
    return new vm.SyntheticModule(names, function () {
      for (const name of names) this.setExport(name, mocks[name] ?? (() => false));
    }, { context });
  });
  await module.evaluate();
  if (fails) {
    await assert.rejects(module.namespace.runChatbotFlow('test', message), /database failed/);
    return;
  }
  const reply = await module.namespace.runChatbotFlow('test', message);
  if (reset) { assert.deepEqual(cleared, ['context', 'history', 'pending-feedback']); assert.equal(writes.length, 0); assert.equal(reply.message, 'Welcome'); return; }
  if (ambiguous) { assert.equal(writes.length, 0); assert.match(reply.message, /welke plaats/); return; }
  assert.equal(writes.length, named ? 2 : 1);
  assert.equal(writes[0].freeText, message);
  assert.equal(writes[0].complete, true);
  assert.equal(writes[0].placeId, 'a');
  assert.equal(writes[0].rating, named ? 'loved' : 'okay');
  assert.match(reply.message, /bewaard/);
  if (named) assert.equal(writes[1].placeId, 'b');
}
await check({ reset: true });
await check();
await check({ named: true });
await check({ ambiguous: true });
await check({ fails: true });
console.log('Natural feedback flow checks passed (4 scenarios).');

const interpreterSource = stripTypeScriptTypes(readFileSync(new URL('../src/ai/interpretPlaceFeedback.ts', import.meta.url), 'utf8'));
const sandbox = vm.createContext({ console: { error() {} } });
let parsed = { isFeedback: true, ambiguityEvidence: '', ambiguousPlace: false, feedback: [
  { placeId: 'a', rating: 'okay', reason: 'food_drinks', evidence: 'iets te pikant' },
  { placeId: 'a', rating: 'loved', reason: 'food_drinks', evidence: 'Lekker' },
  { placeId: 'invented', rating: 'loved', reason: 'food_drinks', evidence: 'Lekker' },
  { placeId: 'b', rating: 'disliked', reason: 'food_drinks', evidence: 'slechte bediening' }
] };
const interpreter = new vm.SourceTextModule(interpreterSource, { context: sandbox });
await interpreter.link(specifier => {
  const values = specifier.includes('recommendationFeedback') ? feedbackLogic : specifier === 'zod' ? { z: { object: () => ({}), boolean: () => ({}), array: () => ({}), string: () => ({}), enum: () => ({}) } }
    : specifier === 'openai/helpers/zod' ? { zodTextFormat: () => ({}) }
    : { hasOpenAIKey: () => true, openaiModel: 'test', getOpenAIClient: () => ({ responses: { parse: async () => ({ output_parsed: parsed }) } }) };
  return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context: sandbox });
});
await interpreter.evaluate();
const interpreted = await interpreter.namespace.interpretPlaceFeedback({ message: 'Lekker maar iets te pikant!', places: [{ id: 'a', name: 'Chez Mami' }, { id: 'b', name: 'B' }] });
assert.equal(interpreted.feedback.length, 1, 'Reject unknown IDs, invented evidence and duplicate ratings');
assert.equal(interpreted.feedback[0].rating, 'okay');
parsed = { isFeedback: false, ambiguityEvidence: '', ambiguousPlace: false, feedback: [] };
assert.equal((await interpreter.namespace.interpretPlaceFeedback({ message: 'Is het pikant?', places: [] })).feedback.length, 0);
console.log('Feedback interpretation validation checks passed.');
const repositorySource = stripTypeScriptTypes(readFileSync(new URL('../src/data/recommendationFeedbackRepository.ts', import.meta.url), 'utf8'));
let stored;
const repository = new vm.SourceTextModule(repositorySource, { context: sandbox });
await repository.link(specifier => specifier.includes('logic/recommendationFeedback') ? new vm.SyntheticModule(Object.keys(feedbackLogic), function () { for (const [key, value] of Object.entries(feedbackLogic)) this.setExport(key, value); }, { context: sandbox }) : specifier.includes('whatsappUsersRepository') ? new vm.SyntheticModule(['resolveUserIdentity'], function () { this.setExport('resolveUserIdentity', async () => ({ userId: 'fixture-id' })); }, { context: sandbox }) : new vm.SyntheticModule(['pool'], function () {
  this.setExport('pool', { query: async (sql, parameters) => { stored = { sql, parameters }; return { rows: [] }; } });
}, { context: sandbox }));
await repository.evaluate();
await repository.namespace.createRecommendationFeedback({ userPhone: 'test', placeId: 'a', placeName: 'Chez Mami', rating: 'loved', reason: 'food_drinks', complete: true, freeText: 'Lekker!', context: { language: 'nl' } });
assert.equal(stored.parameters[8], 'Lekker!');
assert.equal(stored.parameters[9], false, 'Completed spontaneous feedback must not capture the next unrelated message as detail');
assert.equal(stored.parameters[10], 'food_drinks');
console.log('Feedback persistence parameter checks passed.');

parsed = { isFeedback: true, ambiguityEvidence: 'Waar kan ik thieboudienne eten?', ambiguousPlace: true, feedback: [] };
for (const message of ['Waar kan ik thieboudienne eten?', 'Where can I eat dinner?', 'Où puis-je manger ?', 'Wo kann ich essen?']) {
  const result = await interpreter.namespace.interpretPlaceFeedback({ message, places: [] });
  assert.equal(result.isFeedback, false);
  assert.equal(result.ambiguousPlace, false);
}
parsed = { isFeedback: false, ambiguityEvidence: '', ambiguousPlace: true, feedback: [] };
assert.equal((await interpreter.namespace.interpretPlaceFeedback({ message: 'Ik zoek een restaurant', places: [] })).ambiguousPlace, false);
await repository.namespace.closePendingFeedbackConversation('test');
assert.match(stored.sql, /conversation_closed = true/);
assert.doesNotMatch(stored.sql, /DELETE/);
await repository.namespace.getPendingRecommendationFeedback('test');
assert.match(stored.sql, /conversation_closed = false/);
console.log('Search intent and feedback reset checks passed.');

parsed={isFeedback:true,followUpAction:'none',ambiguityEvidence:'',ambiguousPlace:false,feedback:[{
  placeId:'a',rating:'loved',reason:'food_drinks',evidence:'De pizza was fantastisch en het terras was gezellig.',detailEvidence:'pizza was fantastisch',
  aspects:[{aspect:'food',sentiment:'positive',evidence:'pizza was fantastisch'},{aspect:'atmosphere',sentiment:'positive',evidence:'terras was gezellig'},{aspect:'service',sentiment:'positive',evidence:'vriendelijke bediening'}]
}]};
const detailed=await interpreter.namespace.interpretPlaceFeedback({message:parsed.feedback[0].evidence,places:[{id:'a',name:'Pizzammore'}]});
assert.equal(detailed.feedback[0].detailEvidence,'pizza was fantastisch');
assert.equal(detailed.feedback[0].aspects.length,2,'Invented aspect evidence is rejected');
assert.deepEqual({...interpreter.namespace.feedbackAspects(detailed.feedback[0])},{food:'positive',atmosphere:'positive',service:'unknown',value:'unknown'});
console.log('Aspect evidence validation: explicit positive details retained, unmentioned service/value unknown.');
