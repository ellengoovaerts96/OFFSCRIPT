import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import express from 'express';
import { validateRequest, getExpectedTwilioSignature } from 'twilio/lib/webhooks/webhooks.js';

// Exercise real app/webhook code with real signature validation, but no database,
// AI or outgoing Twilio calls. Every identity and credential below is fictitious.
const context = vm.createContext({ process, console, Buffer, URL, setTimeout, clearTimeout });
const calls = [];
const seen = new Set();
const modules = new Map();
const stub = exports => new vm.SyntheticModule(Object.keys(exports), function () {
  for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
}, { context });
async function load(path) {
  if (modules.has(path)) return modules.get(path);
  const module = new vm.SourceTextModule(stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), 'utf8')), { context });
  modules.set(path, module);
  await module.link(async name => {
    if (name === 'express') return stub({ default: express, Router: express.Router });
    if (name === 'twilio/lib/webhooks/webhooks.js') return stub({ validateRequest });
    if (name.endsWith('/whatsapp.js')) return load('../src/channels/whatsapp.ts');
    if (name.endsWith('/twilioWebhook.js')) return load('../src/logic/twilioWebhook.ts');
    if (name.endsWith('/detectLanguage.js')) return stub({ detectLanguage: () => 'en' });
    if (name.endsWith('/chatMessagesRepository.js')) return stub({ createChatMessage: async () => {} });
    if (name.endsWith('/processedTwilioMessagesRepository.js')) return stub({ claimTwilioMessage: async sid => { if (seen.has(sid)) return false; seen.add(sid); return true; } });
    if (name.endsWith('/whatsappUsersRepository.js')) return stub({ getOrCreateWhatsAppUser: async () => ({}) });
    if (name.endsWith('/sourceToken.js')) return stub({ preprocessSourceMessage: async (_phone, message) => ({ message }) });
    if (name.endsWith('/integrations/twilio.js')) return stub({ canSendWhatsAppMessage: () => false, sendWhatsAppMessage: async () => { throw new Error('No external sends allowed'); } });
    if (name.endsWith('/chatbotFlow.js')) return stub({ handleChatMessage: async input => { calls.push(input); return { reply: 'Fictitious test reply', followUpMessages: [], locationActions: [], imageUrls: [], afterMediaMessages: [] }; } });
    // Unrelated admin/redirect routers are outside the scope of this hotfix.
    const routers = { './channels/inbox.js': 'inboxRouter', './channels/sourceRedirect.js': 'sourceRedirectRouter', './channels/sourcesAdmin.js': 'sourcesAdminRouter' };
    if (routers[name]) return stub({ [routers[name]]: express.Router() });
    throw new Error('Unexpected dependency: ' + name);
  });
  return module;
}
process.env.TWILIO_AUTH_TOKEN = 'fictional-hotfix-test-token';
process.env.RAILWAY_GIT_COMMIT_SHA = 'hotfix-test-version';
const module = await load('../src/app.ts');
await module.evaluate();
const server = module.namespace.app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
process.env.TWILIO_WEBHOOK_BASE_URL = origin;
try {
  assert.equal((await (await fetch(origin + '/health')).json()).version, 'hotfix-test-version');
  for (const route of ['/webchat', '/chat/test']) {
    for (const body of [{}, { message: 'reset', userPhone: 'whatsapp:+15555550100' }, { message: 'hello', userPhone: 'dashboard:test:fake' }]) {
      const response = await fetch(origin + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 404);
    }
    assert.equal((await fetch(origin + route)).status, 404);
  }
  assert.equal(calls.length, 0, 'Removed routes must never reach chat processing');
  for (const [index, path] of ['/webhooks/whatsapp', '/webhooks/twilio/whatsapp'].entries()) {
    const body = { Body: 'fictional test', From: 'whatsapp:+15555550100', To: 'whatsapp:+15555550101', MessageSid: 'SM_FAKE_TEST_' + index };
    const post = signature => fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(signature ? { 'x-twilio-signature': signature } : {}) }, body: new URLSearchParams(body) });
    assert.equal((await post()).status, 403);
    assert.equal((await post('invalid')).status, 403);
    assert.equal(calls.length, index);
    const signature = getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN, origin + path, body);
    const good = await post(signature);
    assert.equal(good.status, 200);
    assert.match(await good.text(), /Fictitious test reply/);
    assert.equal(calls.length, index + 1);
    assert.equal((await post(signature)).status, 200);
    assert.equal(calls.length, index + 1, 'Duplicate MessageSid must not process again');
  }
  console.log('PASS: health, removed chat routes, identity/reset attempts, both signed WhatsApp routes, invalid signatures and deduplication. No external services called.');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
