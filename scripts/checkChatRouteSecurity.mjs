import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { createHmac } from 'node:crypto';
import express from 'express';
import * as security from '../src/middleware/stagingChat.ts';
import { adminCsrfToken } from '../src/middleware/adminBasicAuth.ts';

// Load the real route registrations, replacing only chat work and unrelated routers.
// No database, Twilio or OpenAI modules are imported or contacted.
const calls = [];
const context = vm.createContext({ process, console });
function mock(exports) {
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
}
async function load(path) {
  const module = new vm.SourceTextModule(stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), 'utf8')), { context });
  await module.link(async specifier => {
    if (specifier === 'express') return mock({ default: express, Router: express.Router });
    if (specifier.endsWith('/whatsappUsersRepository.js')) return mock({ resolveUserIdentity: async (...args) => { calls.push({ name: 'identity', args }); return { userId: 'test' }; } });
    if (specifier.endsWith('/stagingChat.js')) return mock(security);
    if (specifier.endsWith('/chatbotFlow.js')) return mock(Object.fromEntries(['handleChatMessage', 'runChatbotFlow'].map(name => [name, async (...args) => { assert.equal(calls.at(-1)?.name, 'identity'); assert.equal(calls.at(-1).args[0], name === 'handleChatMessage' ? args[0].userPhone : args[0]); calls.push({ name, args }); return { reply: 'test' }; }])));
    if (specifier.endsWith('/webchat.js')) return load('../src/channels/webchat.ts');
    const name = specifier.split('/').pop().replace('.js', 'Router');
    return mock({ [name]: express.Router() });
  });
  return module;
}
process.env.INBOX_USERNAME = 'security-test-admin';
process.env.INBOX_PASSWORD = 'fictional-security-test-password';
delete process.env.RAILWAY_ENVIRONMENT_NAME;
const module = await load('../src/app.ts');
await module.evaluate();
const server = module.namespace.app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const auth = 'Basic ' + Buffer.from('security-test-admin:fictional-security-test-password').toString('base64');
async function request(route, { authenticated = true, csrf = true, cookie, extra = {} } = {}) {
  return fetch(origin + route, { method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: auth } : {}), ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ message: 'fictional test', ...(csrf ? { _csrf: adminCsrfToken() } : {}), ...extra }) });
}
try {
  for (const route of ['/chat/test', '/webchat']) {
    for (const environment of [undefined, 'production', 'unknown']) {
      if (environment === undefined) delete process.env.TUUTI_ENVIRONMENT;
      else process.env.TUUTI_ENVIRONMENT = environment;
      assert.equal((await request(route)).status, 404);
    }
    process.env.TUUTI_ENVIRONMENT = 'staging';
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    assert.equal((await request(route)).status, 404);
    delete process.env.RAILWAY_ENVIRONMENT_NAME;
    assert.equal((await request(route, { authenticated: false })).status, 401);
    assert.equal((await request(route, { csrf: false })).status, 403);
    const password = process.env.INBOX_PASSWORD;
    process.env.INBOX_PASSWORD = 'other-test-password';
    assert.equal((await request(route)).status, 401);
    delete process.env.INBOX_PASSWORD;
    assert.equal((await request(route)).status, 503);
    process.env.INBOX_PASSWORD = password;
    assert.equal((await request(route, { extra: { userPhone: 'whatsapp:+221770000000' } })).status, 400);
    assert.equal(calls.length, 0, 'Denied requests must never call chat/database logic');
    const first = await request(route);
    assert.equal(first.status, 200);
    const setCookie = first.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(';')[0];
    const id = () => { const call = calls.at(-1); return call.name === 'handleChatMessage' ? call.args[0].userPhone : call.args[0]; };
    const original = id();
    assert.match(original, /^dashboard:test:[0-9a-f-]{36}$/);
    assert.equal((await request(route, { cookie })).status, 200);
    assert.equal(id(), original, 'Valid cookie preserves conversation continuity');
    await request(route);
    assert.notEqual(id(), original, 'Different browser gets a different identity');
    await request(route, { cookie: cookie.slice(0, -1) + (cookie.endsWith('a') ? 'b' : 'a') });
    assert.notEqual(id(), original, 'Tampered signature cannot select an identity');
    const expiredPayload = `${original.slice('dashboard:test:'.length)}.${Date.now() - 1000}`;
    const expiredSignature = createHmac('sha256', process.env.INBOX_PASSWORD).update('tuuti-staging-chat:' + expiredPayload).digest('hex');
    await request(route, { cookie: `tuuti_staging_chat=${expiredPayload}.${expiredSignature}` });
    assert.notEqual(id(), original, 'Expired signed cookie gets a new identity');
    process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
    assert.match((await request(route)).headers.get('set-cookie'), /Secure/);
    delete process.env.RAILWAY_ENVIRONMENT_NAME;
    calls.length = 0;
  }
  console.log('Chat route security checks passed: environment, auth, CSRF, identity isolation and continuity.');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
