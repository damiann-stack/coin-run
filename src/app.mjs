import { randomBytes, randomInt } from 'node:crypto';
import { parseLevel, createRun, step, ENGINE_VERSION } from './engine.mjs';
import { LEVELS } from './levels.mjs';
import { RULES } from './rules.mjs';
import { verifyProxy } from './proxy.mjs';

const PARSED = LEVELS.map(parseLevel);
const fresh = () => ({ v: 1, coins: 0, cleared: [false, false, false], level4: false, attempts: { used: 0, lockedUntil: 0 }, runs: {}, claim: null });

// Replays a run exactly as the player's browser played it and returns what happened.
export function replay(levelIndex, seed, inputs, ticks) {
  const lv = PARSED[levelIndex];
  const s = createRun(lv, { seed });
  const stop = Math.min(lv.limit, ticks);
  let i = 0, mask = 0;
  while (!s.finished && !s.timeUp && s.tick < stop) {
    while (i < inputs.length && inputs[i][0] <= s.tick + 1) { mask = inputs[i][1] & 15; i++; }
    step(s, mask);
  }
  return { finished: s.finished, coins: s.coins, ticks: s.tick, unlocked: s.unlocked };
}

function validInputs(inputs, ticks) {
  if (!Array.isArray(inputs) || inputs.length > 30000) return false;
  let last = 0;
  for (const p of inputs) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || !Number.isInteger(p[1])) return false;
    if (p[0] < last || p[0] < 0 || p[0] > ticks + 1 || p[1] < 0 || p[1] > 15) return false;
    last = p[0];
  }
  return true;
}

export function createApp({ store, secret, owners = [], now = () => Date.now(), checkPriorReward = true, maxAgeSec = 300, makeSeed = () => randomInt(1, 2 ** 31) }) {
  const ownerSet = new Set(owners.map(String));

  function attemptsView(st, t, unlimited) {
    if (unlimited) return { attemptsRemaining: null, attemptsResetAt: null, unlimitedAttempts: true };
    const a = st.attempts;
    if (a.lockedUntil && t >= a.lockedUntil) return { attemptsRemaining: RULES.attemptsPerWindow, attemptsResetAt: null, unlimitedAttempts: false };
    return { attemptsRemaining: Math.max(0, RULES.attemptsPerWindow - a.used), attemptsResetAt: a.lockedUntil ? new Date(a.lockedUntil).toISOString() : null, unlimitedAttempts: false };
  }
  function balance(st, t, unlimited) {
    const courseCleared = RULES.clearLevels.every(i => st.cleared[i]);
    return { open: true, engine: ENGINE_VERSION, coins: st.coins, cleared: st.cleared, courseCleared, level4: st.level4,
      ...attemptsView(st, t, unlimited), rewardCoins: RULES.rewardCoins, rewardAmount: RULES.rewardAmount,
      claimed: !!(st.claim && st.claim.status === 'done'),
      redeemEnabled: !st.claim && courseCleared && st.coins >= RULES.rewardCoins };
  }

  // Load, change and save one record, trying again if two requests overlap.
  async function update(cid, fn) {
    for (let tries = 0; tries < 4; tries++) {
      const got = await store.load(cid);
      if (!got) return { status: 404, json: { message: 'Account not found.' } };
      const st = got.state ? { ...fresh(), ...got.state } : fresh();
      const out = await fn(st);
      if (!out.save) return out.res;
      const saved = await store.save(cid, st, got.digest);
      if (saved.ok) return out.res;
    }
    return { status: 409, json: { message: 'Busy, please try again.' } };
  }

  async function handle({ method, url, body }) {
    const path = new URL(url, 'https://x.invalid').pathname.replace(/\/+$/, '');
    if (path.endsWith('/health')) return { status: 200, json: { ok: true, engine: ENGINE_VERSION } };
    const who = verifyProxy(url, secret, { now: now(), maxAgeSec });
    if (!who) return { status: 403, json: { message: 'This request did not come through the store.' } };
    if (!who.customerId) return { status: 401, json: { message: 'Sign in to your store account to play for coins.' } };
    const cid = who.customerId, t = now(), unlimited = ownerSet.has(cid);
    const route = path.split('/').pop();
    let data = {};
    if (method === 'POST') { try { data = typeof body === 'string' ? JSON.parse(body || '{}') : (body || {}); } catch { return { status: 400, json: { message: 'Bad request.' } }; } }

    if (route === 'balance' && method === 'GET') {
      return update(cid, async st => ({ save: false, res: { status: 200, json: balance(st, t, unlimited) } }));
    }

    if (route === 'start' && method === 'POST') {
      const level = data.level;
      if (data.engine !== ENGINE_VERSION) return { status: 409, json: { message: 'The game was updated. Refresh the page to play.' } };
      if (![0, 1, 2, 3].includes(level)) return { status: 400, json: { message: 'Pick a level.' } };
      return update(cid, async st => {
        if (level === 3 && !st.level4) return { save: false, res: { status: 403, json: { message: 'Find the glowing Bible in a Level 3 coin run to open Level 4.' } } };
        if (!unlimited) {
          const a = st.attempts;
          if (a.lockedUntil && t >= a.lockedUntil) { a.used = 0; a.lockedUntil = 0; }
          if (a.used >= RULES.attemptsPerWindow) return { save: false, res: { status: 429, json: { message: `You've used all 8 runs. New runs open ${new Date(a.lockedUntil).toUTCString()}.`, ...attemptsView(st, t, false) } } };
          a.used++;
          if (a.used >= RULES.attemptsPerWindow) a.lockedUntil = t + RULES.lockoutMs;
        }
        for (const [id, r] of Object.entries(st.runs)) if (t - r.at > RULES.runTtlMs) delete st.runs[id];
        const ids = Object.keys(st.runs).sort((x, y) => st.runs[x].at - st.runs[y].at);
        while (ids.length >= RULES.maxOpenRuns) delete st.runs[ids.shift()];
        const runId = randomBytes(12).toString('hex'), seed = makeSeed();
        st.runs[runId] = { level, seed, at: t };
        return { save: true, res: { status: 200, json: { runId, seed, level, ...attemptsView(st, t, unlimited) } } };
      });
    }

    if (route === 'finish' && method === 'POST') {
      const { runId, level, ticks, inputs } = data;
      if (typeof runId !== 'string' || !Number.isInteger(ticks) || ticks < 0 || !validInputs(inputs, ticks)) return { status: 400, json: { message: 'This run could not be read.' } };
      return update(cid, async st => {
        const run = st.runs[runId];
        if (!run || run.level !== level) return { save: false, res: { status: 404, json: { message: 'This run was already counted or has expired.' } } };
        delete st.runs[runId];
        if (t - run.at > RULES.runTtlMs) return { save: true, res: { status: 410, json: { message: 'This run took too long to send, so it was not counted.' } } };
        const r = replay(level, run.seed, inputs, ticks);
        let message = '', coins = 0;
        if (r.finished) {
          coins = r.coins; st.coins += coins;
          if (level < 3) st.cleared[level] = true;
          if (level === 2 && r.unlocked && !st.level4) { st.level4 = true; message = 'Level 4 is open for coin runs.'; }
        } else message = 'Only finished runs save coins. Reach the tomb to keep them.';
        return { save: true, res: { status: 200, json: { counted: true, finished: r.finished, coins, totalCoins: st.coins, message, ...balance(st, t, unlimited) } } };
      });
    }

    if (route === 'redeem' && method === 'POST') {
      // Step 1: reserve the reward so it can only happen once.
      const reserved = await update(cid, async st => {
        const b = balance(st, t, unlimited);
        if (st.claim) return { save: false, res: { status: 409, json: { credited: false, message: 'This account already has its Crown Coin reward.' } } };
        if (!b.redeemEnabled) return { save: false, res: { status: 403, json: { credited: false, message: `You need ${RULES.rewardCoins.toLocaleString('en-US')} coins and a clear of all three levels first.` } } };
        st.claim = { status: 'pending', at: t };
        return { save: true, res: { status: 200, json: { reserved: true } } };
      });
      if (!reserved.json?.reserved) return reserved;
      try {
        if (checkPriorReward && await store.hasPriorReward(cid, RULES.rewardAmount, RULES.rewardCurrency)) {
          await update(cid, async st => { st.claim = { status: 'done', at: t, note: 'earlier reward found' }; return { save: true, res: {} }; });
          return { status: 409, json: { credited: false, message: 'This account already has its Crown Coin reward.' } };
        }
        const { txId } = await store.credit(cid, RULES.rewardAmount, RULES.rewardCurrency);
        return update(cid, async st => { st.claim = { status: 'done', at: t, txId }; return { save: true, res: { status: 200, json: { credited: true, message: '$3 store credit was added to your account.', ...balance(st, t, unlimited) } } }; });
      } catch (e) {
        await update(cid, async st => { if (st.claim?.status === 'pending') st.claim = null; return { save: true, res: {} }; });
        return { status: 502, json: { credited: false, message: 'The store credit could not be added right now. Please try again later.' } };
      }
    }
    return { status: 404, json: { message: 'Not found.' } };
  }
  return { handle };
}
