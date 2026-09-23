import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/integrations/twilio.ts', import.meta.url), 'utf8');
async function check(statuses, outcome, timeout = false) {
  const timers = new Map();
  let fetches = 0, payload; 
  const messages = () => ({ fetch: async () => ({ status: statuses[Math.min(fetches++, statuses.length - 1)] }) });
  messages.create = async value => { payload = value; return { sid: 'SMtest', status: 'queued' }; };
  const context = vm.createContext({ process: { env: { TWILIO_WHATSAPP_FROM: '+15005550006' } }, setTimeout(fn, ms) { timers.set(ms, fn); return ms; }, clearTimeout(id) { timers.delete(id); } });
  const module = new vm.SourceTextModule(stripTypeScriptTypes(source), { context });
  await module.link(() => new vm.SyntheticModule(['default'], function () { this.setExport('default', () => ({ messages })); }, { context }));
  await module.evaluate();
  let settled = false;
  const pending = module.namespace.sendWhatsAppMessage('+221771234567', 'Info', undefined, 'whatsapp:+15005550007', undefined, true).then(() => { settled = true; return 'delivered'; }, e => { settled = true; return e.message; });
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  await flush();
  assert.equal(payload.from, 'whatsapp:+15005550007', 'Reply using the incoming webhook sender');
  assert.equal(payload.to, 'whatsapp:+221771234567');
  assert.equal(module.namespace.whatsappAddress(' +221 77 123 45 67 '), 'whatsapp:+221771234567');
  assert.equal(module.namespace.whatsappAddress('whatsapp:+221771234567'), 'whatsapp:+221771234567');
  assert.throws(() => module.namespace.whatsappAddress('sms:+221771234567'));
  assert.equal(settled, false, 'Queue acceptance must not count as delivery');
  if (timeout) { timers.get(60000)(); await flush(); }
  else {
    for (const status of statuses) {
      const tick = timers.get(1000); timers.delete(1000); tick(); await flush();
      if (status === 'sent' || status === 'queued') assert.equal(settled, false);
      if (settled) break;
    }
  }
  assert.match(await pending, outcome);
  await module.namespace.sendWhatsAppMessage('whatsapp:+221771234567', 'Configured sender');
  assert.equal(payload.from, 'whatsapp:+15005550006', 'Normalize a bare configured sender too');
  assert.equal(payload.to, 'whatsapp:+221771234567');
  assert.equal(timers.has(60000), false);
}
await check(['sent', 'delivered'], /^delivered$/);
await check(['read'], /^delivered$/);
await check(['failed'], /was failed/);
await check(['undelivered'], /was undelivered/);
await check(['queued'], /timed out/, true);
console.log('WhatsApp delivery checks passed (5 scenarios).');
