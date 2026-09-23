import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/channels/whatsapp.ts', import.meta.url), 'utf8');
const result = { reply: 'Padel in Dakar', followUpMessages: [], locationActions: [], imageUrls: [], videoUrls: [], afterMediaMessages: [] };
async function scenario({ delayedPreparation = false, duplicate = false, fails = false } = {}) {
  let handler, release;
  const timers = new Map();
  const responses = [], sent = [], logs = [];
  let calls = 0;
  const preparation = delayedPreparation ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const context = vm.createContext({
    console: { error() {} },
    setTimeout(fn, ms) { timers.set(ms, fn); return ms; },
    clearTimeout(id) { timers.delete(id); }
  });
  const dependencies = {
    express: { Router: () => ({ post(path, middleware, fn) { handler = fn; } }) },
    '../ai/detectLanguage.js': { detectLanguage: () => 'nl' },
    '../data/chatMessagesRepository.js': { createChatMessage: async value => logs.push(value) },
    '../integrations/twilio.js': { canSendWhatsAppMessage: () => true, sendWhatsAppMessage: async (...args) => sent.push(args) },
    '../logic/chatbotFlow.js': { handleChatMessage: async () => { calls++; return result; } },
    '../logic/twilioWebhook.js': {
      validateTwilioWebhook() {},
      prepareInboundWhatsAppMessage: async () => { await preparation; if (fails) throw Error('database unavailable'); return { duplicate, message: 'oké' }; }
    }
  };
  const module = new vm.SourceTextModule(stripTypeScriptTypes(source), { context });
  await module.link(specifier => {
    const exports = dependencies[specifier];
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  const pending = handler({ body: { Body: 'oké', From: 'test-user', To: 'test-bot', MessageSid: 'test-id' } }, { type() { return this; }, send(body) { responses.push(body); } });
  if (delayedPreparation) {
    assert(timers.has(10000), 'Deadline must start while preparation is still pending');
    timers.get(10000)();
    await pending;
    assert.match(responses[0], /Eén moment/);
    release();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    if (duplicate) { assert.equal(sent.length, 0); assert.equal(calls, 0); }
    else if (fails) { assert.match(sent[0][1], /Sorry/); assert.equal(calls, 0); }
    else { assert.equal(sent[0][1], result.reply); assert.equal(calls, 1); }
  } else {
    await pending;
    assert.match(responses[0], duplicate ? /<Response><\/Response>/ : /Padel in Dakar/);
    assert.equal(calls, duplicate ? 0 : 1);
  }
  assert.equal(responses.length, 1);
  assert.equal(timers.size, 0);
}
await scenario();
await scenario({ duplicate: true });
await scenario({ delayedPreparation: true });
await scenario({ delayedPreparation: true, duplicate: true });
await scenario({ delayedPreparation: true, fails: true });
console.log('WhatsApp preparation deadline checks passed (5 scenarios).');
