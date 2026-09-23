import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/integrations/twilio.ts', import.meta.url), 'utf8');
async function check(statuses, outcome, timeout = false) {
  const timers = new Map();
  let fetches = 0;
  const messages = () => ({ fetch: async () => ({ status: statuses[Math.min(fetches++, statuses.length - 1)] }) });
  messages.create = async () => ({ sid: 'SMtest', status: 'queued' });
  const context = vm.createContext({ process: { env: { TWILIO_WHATSAPP_FROM: 'whatsapp:test' } }, setTimeout(fn, ms) { timers.set(ms, fn); return ms; }, clearTimeout(id) { timers.delete(id); } });
  const module = new vm.SourceTextModule(stripTypeScriptTypes(source), { context });
  await module.link(() => new vm.SyntheticModule(['default'], function () { this.setExport('default', () => ({ messages })); }, { context }));
  await module.evaluate();
  let settled = false;
  const pending = module.namespace.sendWhatsAppMessage('test', 'Info', undefined, undefined, undefined, true).then(() => { settled = true; return 'delivered'; }, e => { settled = true; return e.message; });
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  await flush();
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
  assert.equal(timers.has(60000), false);
}
await check(['sent', 'delivered'], /^delivered$/);
await check(['read'], /^delivered$/);
await check(['failed'], /was failed/);
await check(['undelivered'], /was undelivered/);
await check(['queued'], /timed out/, true);
console.log('WhatsApp delivery checks passed (5 scenarios).');
