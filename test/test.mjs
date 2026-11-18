import assert from 'node:assert/strict';
import { createApp } from '../src/app.mjs';
import { memoryStore } from '../src/shopify.mjs';
import { signProxy, verifyProxy } from '../src/proxy.mjs';
import { DEMO, DEMO_SEED } from './demo-runs.mjs';
import { RULES } from '../src/rules.mjs';
import { ENGINE_VERSION } from '../src/engine.mjs';

const SECRET = 'test-secret';
let clock = 1_800_000_000_000;
const store = memoryStore();
const app = createApp({ store, secret: SECRET, owners: ['99'], now: () => clock, makeSeed: () => DEMO_SEED });
const req = (method, route, cid, body, { secret = SECRET, ts } = {}) => app.handle({ method, url: signProxy(`/proxy/${route}`, { shop: 'test.myshopify.com', logged_in_customer_id: cid, path_prefix: '/apps/coin-run', timestamp: String(ts ?? Math.floor(clock / 1000)) }, secret), body: body && JSON.stringify(body) });
const lastTick = i => DEMO[i][DEMO[i].length - 1][0] + 2000;
async function play(cid, level, { inputs = DEMO[level], ticks = lastTick(level) } = {}) {
  const s = await req('POST', 'start', cid, { level, engine: ENGINE_VERSION });
  if (s.status !== 200) return s;
  return req('POST', 'finish', cid, { runId: s.json.runId, level, engine: ENGINE_VERSION, ticks, inputs });
}
let n = 0; const ok = (name, fn) => fn().then(() => { n++; console.log('ok', name); });

await ok('signature check', async () => {
  assert.equal((await req('GET', 'balance', '1', null, { secret: 'wrong' })).status, 403);
  assert.equal((await req('GET', 'balance', '1', null, { ts: Math.floor(clock / 1000) - 3600 })).status, 403);
  assert.equal((await req('GET', 'balance', '', null)).status, 401);
  const url = signProxy('/p/balance', { a: '1', shop: 's' }, SECRET);
  assert.ok(verifyProxy(url, SECRET, { now: 0, maxAgeSec: 1e12 }) === null); // no timestamp
});
await ok('new player balance', async () => {
  const b = await req('GET', 'balance', '1');
  assert.equal(b.status, 200); assert.equal(b.json.coins, 0); assert.equal(b.json.attemptsRemaining, 8); assert.equal(b.json.redeemEnabled, false);
});
await ok('finished run is replayed and counted', async () => {
  const r = await play('1', 0);
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.finished, true); assert.equal(r.json.coins, 46); assert.equal(r.json.totalCoins, 46);
  assert.equal(r.json.cleared[0], true);
});
await ok('same run cannot be counted twice', async () => {
  const s = await req('POST', 'start', '1', { level: 0, engine: ENGINE_VERSION });
  const body = { runId: s.json.runId, level: 0, engine: ENGINE_VERSION, ticks: lastTick(0), inputs: DEMO[0] };
  assert.equal((await req('POST', 'finish', '1', body)).status, 200);
  assert.equal((await req('POST', 'finish', '1', body)).status, 404);
});
await ok('quitting early saves nothing', async () => {
  const r = await play('2', 0, { ticks: 300, inputs: DEMO[0].filter(p => p[0] <= 300) });
  assert.equal(r.json.finished, false); assert.equal(r.json.coins, 0); assert.equal(r.json.totalCoins, 0);
});
await ok('made-up inputs cannot fake a finish', async () => {
  const r = await play('3', 0, { inputs: [[1, 1]], ticks: 5000 });
  assert.equal(r.json.finished, false); assert.equal(r.json.totalCoins, 0);
  assert.equal((await play('3', 0, { inputs: [[5, 1], [2, 0]] })).status, 400);
  assert.equal((await play('3', 0, { inputs: [[5, 99]] })).status, 400);
});
await ok('8 runs then a 24 hour wait', async () => {
  for (let i = 0; i < 6; i++) assert.equal((await req('POST', 'start', '4', { level: 0, engine: ENGINE_VERSION })).status, 200);
  assert.equal((await req('POST', 'start', '4', { level: 0, engine: ENGINE_VERSION })).json.attemptsRemaining, 1);
  assert.equal((await req('POST', 'start', '4', { level: 0, engine: ENGINE_VERSION })).json.attemptsRemaining, 0);
  const blocked = await req('POST', 'start', '4', { level: 0, engine: ENGINE_VERSION });
  assert.equal(blocked.status, 429);
  clock += RULES.lockoutMs + 1000;
  const again = await req('POST', 'start', '4', { level: 0, engine: ENGINE_VERSION });
  assert.equal(again.status, 200); assert.equal(again.json.attemptsRemaining, 7);
});
await ok('owner has unlimited runs', async () => {
  for (let i = 0; i < 12; i++) assert.equal((await req('POST', 'start', '99', { level: 0, engine: ENGINE_VERSION })).status, 200);
  assert.equal((await req('GET', 'balance', '99')).json.unlimitedAttempts, true);
});
await ok('level 4 needs the glowing Bible from a level 3 coin run', async () => {
  assert.equal((await req('POST', 'start', '5', { level: 3, engine: ENGINE_VERSION })).status, 403);
  const r = await play('5', 2);
  assert.equal(r.json.finished, true); assert.equal(r.json.level4, true);
  assert.equal((await play('5', 3)).json.finished, true);
});
await ok('old game version is refused', async () => {
  assert.equal((await req('POST', 'start', '1', { level: 0, engine: 'old' })).status, 409);
});
await ok('reward needs 2,500 coins and all three levels, once only', async () => {
  assert.equal((await req('POST', 'redeem', '6', {})).status, 403);
  const row = await store.load('6');
  await store.save('6', { v: 1, coins: 2600, cleared: [true, true, false], level4: false, attempts: { used: 0, lockedUntil: 0 }, runs: {}, claim: null }, row.digest);
  assert.equal((await req('POST', 'redeem', '6', {})).status, 403);
  const r2 = await store.load('6'); r2.state.cleared[2] = true; await store.save('6', r2.state, r2.digest);
  const r = await req('POST', 'redeem', '6', {});
  assert.equal(r.status, 200); assert.equal(r.json.credited, true);
  assert.deepEqual(store.credits, [{ id: '6', amount: '3.00', currency: 'USD' }]);
  assert.equal((await req('POST', 'redeem', '6', {})).status, 409);
  assert.equal(store.credits.length, 1);
});
await ok('two redeem taps at once give one reward', async () => {
  const row = await store.load('7');
  await store.save('7', { v: 1, coins: 3000, cleared: [true, true, true], level4: false, attempts: { used: 0, lockedUntil: 0 }, runs: {}, claim: null }, row.digest);
  const before = store.credits.length;
  const rs = await Promise.all([req('POST', 'redeem', '7', {}), req('POST', 'redeem', '7', {}), req('POST', 'redeem', '7', {})]);
  assert.equal(rs.filter(r => r.json.credited).length, 1); assert.equal(store.credits.length, before + 1);
});
await ok('a failed credit can be tried again', async () => {
  const row = await store.load('8');
  await store.save('8', { v: 1, coins: 3000, cleared: [true, true, true], level4: false, attempts: { used: 0, lockedUntil: 0 }, runs: {}, claim: null }, row.digest);
  const real = store.credit; store.credit = async () => { throw new Error('down'); };
  assert.equal((await req('POST', 'redeem', '8', {})).status, 502);
  store.credit = real;
  assert.equal((await req('POST', 'redeem', '8', {})).json.credited, true);
});
console.log(`${n} checks passed`);
