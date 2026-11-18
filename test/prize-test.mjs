import assert from 'node:assert/strict';
import { createApp } from '../src/app.mjs';
import { memoryStore } from '../src/shopify.mjs';
import { signProxy } from '../src/proxy.mjs';
import { ENGINE_VERSION } from '../src/engine.mjs';
import { PRIZE_SEED, PRIZE_TICKS, PRIZE_RUN } from './prize-run.mjs';

const SECRET = 's';
let clock = 1_800_000_000_000;
const store = memoryStore();
const app = createApp({ store, secret: SECRET, now: () => clock, makeSeed: () => PRIZE_SEED });
const req = (method, route, cid, body) => app.handle({ method, url: signProxy(`/proxy/${route}`, { shop: 't.myshopify.com', logged_in_customer_id: cid, path_prefix: '/apps/coin-run', timestamp: String(Math.floor(clock / 1000)) }, SECRET), body: body && JSON.stringify(body) });
const tryWin = async (cid, inputs = PRIZE_RUN) => {
  const s = await req('POST', 'prize-start', cid, { engine: ENGINE_VERSION });
  if (s.status !== 200) return s;
  return req('POST', 'prize-finish', cid, { runId: s.json.runId, ticks: PRIZE_TICKS, inputs });
};
let n = 0; const ok = (name, fn) => fn().then(() => { n++; console.log('ok', name); });

await ok('signed-out players cannot start a prize run', async () => {
  assert.equal((await req('POST', 'prize-start', '', { engine: ENGINE_VERSION })).status, 401);
});
await ok('a run that stops short wins nothing', async () => {
  const r = await tryWin('1', PRIZE_RUN.slice(0, 20));
  assert.equal(r.status, 200); assert.equal(r.json.finished, false); assert.equal(store.prizes.length, 0);
});
await ok('a real Level 30 win makes two codes for that player', async () => {
  const r = await tryWin('1');
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.prize.ready, true);
  assert.match(r.json.prize.shipCode, /^CROWN-SHIP-[0-9A-F]{10}$/); assert.match(r.json.prize.giftCode, /^CROWN-GIFT-[0-9A-F]{10}$/);
  assert.equal(store.prizes.length, 1); assert.equal(store.prizes[0].id, '1');
  const b = await req('GET', 'balance', '1');
  assert.equal(b.json.prize.shipCode, r.json.prize.shipCode); assert.equal(b.json.coins, 0, 'prize runs never add coins');
  assert.equal(b.json.attemptsRemaining, 8, 'prize runs never use coin runs');
});
await ok('one prize per account', async () => {
  const r = await tryWin('1');
  assert.equal(r.status, 409); assert.equal(store.prizes.length, 1); assert.equal(r.json.prize.shipCode, store.prizes[0].shipCode);
});
await ok('the same run cannot be sent twice', async () => {
  const s = await req('POST', 'prize-start', '2', { engine: ENGINE_VERSION });
  const body = { runId: s.json.runId, ticks: PRIZE_TICKS, inputs: PRIZE_RUN.slice(0, 5) };
  assert.equal((await req('POST', 'prize-finish', '2', body)).json.finished, false);
  assert.equal((await req('POST', 'prize-finish', '2', body)).status, 404);
});
await ok('a real win counts with any seed, because inputs are replayed', async () => {
  const a2 = createApp({ store, secret: SECRET, now: () => clock, makeSeed: () => 12345 });
  const r2 = (m, route, cid, body) => a2.handle({ method: m, url: signProxy(`/proxy/${route}`, { shop: 't', logged_in_customer_id: cid, timestamp: String(Math.floor(clock / 1000)) }, SECRET), body: JSON.stringify(body) });
  const s = await r2('POST', 'prize-start', '3', { engine: ENGINE_VERSION });
  const f = await r2('POST', 'prize-finish', '3', { runId: s.json.runId, ticks: PRIZE_TICKS, inputs: PRIZE_RUN });
  // Level 30 has no random parts, so a real win still counts with any seed; what matters is that inputs are replayed.
  assert.equal(f.status, 200); assert.equal(f.json.finished, true);
});
await ok('if the codes fail, the win is kept and can be claimed later', async () => {
  store.failPrize = true;
  const r = await tryWin('4');
  assert.equal(r.status, 502); assert.equal(r.json.finished, true);
  store.failPrize = false;
  const c = await req('POST', 'prize-claim', '4', {});
  assert.equal(c.status, 200); assert.equal(c.json.prize.ready, true);
  assert.equal((await req('POST', 'prize-claim', '4', {})).json.prize.giftCode, c.json.prize.giftCode);
  assert.equal(store.prizes.filter(p => p.id === '4').length, 1);
});
await ok('claiming without a win is refused', async () => {
  assert.equal((await req('POST', 'prize-claim', '5', {})).status, 403);
});
console.log(n, 'prize checks passed');
