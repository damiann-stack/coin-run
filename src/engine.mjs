// Crown Coin Run 2 engine. Pure and deterministic: the same level, seed and
// inputs always give the same result, so a coin server can replay a run.
// Units are tiles; one step is 1/60 s. y grows downward.

export const ENGINE_VERSION = 'ccr2-1';
export const TPS = 60;
export const BTN = { JUMP: 1, LEFT: 2, RIGHT: 4, FIRE: 8 };

const K = {
  RUN: 0.14, WING_RUN: 0.155,
  ACC_G: 0.02, ACC_A: 0.012,
  G: 0.026, MAXF: 0.42, CUT: 0.034,
  JUMP: 0.40, DJUMP: 0.34, KICK: 0.38, VAULT: 0.3, FLAP: 0.25,
  SLIDE: 0.07, WING_MAXF: 0.16,
  COYOTE: 6, BUFFER: 7, WALL_GRACE: 5, KICK_LOCK: 7,
  HALF_W: 0.35, HEIGHT: 1.4,
  WINGS: 480, FIRE_MAX: 5, MAGNET: 3.2,
  SHOT_V: 0.4, SHOT_LIFE: 55,
  DEMON_V: 0.118, DEMON_CATCHUP: 0.2, DEMON_DELAY: 120,
};
export const CONSTANTS = K;

const SOLID = new Set(['#', 'R']);

export function parseLevel(def) {
  const rows = def.rows;
  const H = rows.length, W = rows[0].length;
  const lv = { name: def.name, W, H, rows, chase: !!def.chase, limit: (def.limitSeconds || 240) * TPS,
    start: { x: 2.5, y: 10 }, checkpoints: [], coinCount: 0, tombX: W - 4, tombY: H - 8, hints: def.hints || [] };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = rows[y][x];
      if (c === 'P') lv.start = { x: x + 0.5, y: y + 1 };
      else if (c === 'o') lv.coinCount++;
      else if (c === 'C') lv.checkpoints.push({ x, y });
      else if (c === 'T') { lv.tombX = x; lv.tombY = y; }
    }
  }
  return lv;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function createRun(lv, { seed = 1, startCheckpoint = -1 } = {}) {
  const s = {
    lv, seed, rng: mulberry(seed), tick: 0,
    px: lv.start.x, py: lv.start.y, vx: 0, vy: 0, face: 1,
    onGround: true, coyote: 0, buffer: 0, prev: 0, canDouble: true,
    wallDir: 0, wallGrace: 0, vaultT: 0, graceDir: 0, kickLock: 0, jumpHeld: false,
    wingsT: 0, fire: 0, coins: 0, taken: new Uint8Array(lv.W * lv.H),
    cp: { x: lv.start.x, y: lv.start.y }, cpIndex: -1,
    finished: false, timeUp: false, finishTick: -1, deaths: 0, invuln: 0,
    jumps: 0, kicks: 0, flights: 0, banishTick: -1, unlocked: false,
    demon: lv.chase ? { x: lv.start.x - 14, y: lv.start.y - 2, banished: false, fade: 0 } : null,
    shots: [], events: [],
  };
  if (startCheckpoint >= 0 && lv.checkpoints[startCheckpoint]) {
    const c = lv.checkpoints[startCheckpoint];
    s.cp = { x: c.x + 0.5, y: c.y + 1 }; s.cpIndex = startCheckpoint;
    s.px = s.cp.x; s.py = s.cp.y;
    if (s.demon) s.demon.x = s.px - 14;
  }
  return s;
}

function tileAt(lv, x, y) {
  if (x < 0 || x >= lv.W) return '#';
  if (y < 0 || y >= lv.H) return '.';
  return lv.rows[y][x];
}
function solidAt(lv, x, y) {
  if (x < 0 || x >= lv.W) return true;
  if (y < 0 || y >= lv.H) return false;
  return SOLID.has(lv.rows[y][x]);
}

function hurt(s) {
  s.deaths++;
  s.events.push({ t: 'hurt', x: s.px, y: s.py });
  s.px = s.cp.x; s.py = s.cp.y; s.vx = 0; s.vy = 0; s.face = 1;
  s.wingsT = 0; s.kickLock = 0; s.buffer = 0; s.canDouble = true; s.invuln = 90;
  s.onGround = true; s.shots.length = 0;
  if (s.demon && !s.demon.banished) { s.demon.x = s.px - 15; s.demon.y = s.py - 2; }
}

function moveX(s) {
  const lv = s.lv;
  s.px += s.vx;
  const top = s.py - K.HEIGHT + 0.02, bot = s.py - 0.02;
  const r0 = Math.floor(top), r1 = Math.floor(bot);
  let hit = 0;
  if (s.vx > 0) {
    const col = Math.floor(s.px + K.HALF_W);
    for (let r = r0; r <= r1; r++) if (solidAt(lv, col, r)) { s.px = col - K.HALF_W - 0.0001; hit = 1; break; }
  } else if (s.vx < 0) {
    const col = Math.floor(s.px - K.HALF_W);
    for (let r = r0; r <= r1; r++) if (solidAt(lv, col, r)) { s.px = col + 1 + K.HALF_W + 0.0001; hit = -1; break; }
  }
  if (hit) {
    if (s.vaultT > 0) { s.vx = s.face * K.RUN; return; }
    s.vx = 0;
    if (s.onGround) {
      // A one-tile step gets an automatic hop. Taller walls stop the runner.
      const col = hit > 0 ? Math.floor(s.px + K.HALF_W + 0.01) : Math.floor(s.px - K.HALF_W - 0.01);
      const foot = Math.floor(s.py - 0.5);
      if (solidAt(lv, col, foot) && !solidAt(lv, col, foot - 1) && !solidAt(lv, col, foot - 2)) {
        s.vy = -K.VAULT; s.onGround = false; s.vaultT = 14; s.vx = s.face * K.RUN; s.events.push({ t: 'vault' });
      }
    }
  }
}

function moveY(s) {
  const lv = s.lv;
  const wasGround = s.onGround;
  s.py += s.vy;
  const c0 = Math.floor(s.px - K.HALF_W + 0.02), c1 = Math.floor(s.px + K.HALF_W - 0.02);
  s.onGround = false;
  if (s.vy >= 0) {
    const row = Math.floor(s.py);
    for (let c = c0; c <= c1; c++) if (solidAt(lv, c, row)) {
      s.py = row; s.vy = 0; s.onGround = true; break;
    }
  } else {
    const row = Math.floor(s.py - K.HEIGHT);
    for (let c = c0; c <= c1; c++) if (solidAt(lv, c, row)) {
      s.py = row + 1 + K.HEIGHT; s.vy = 0; s.events.push({ t: 'bonk' }); break;
    }
  }
  if (s.onGround && !wasGround) s.events.push({ t: 'land' });
}

function touchingWall(s) {
  if (s.onGround) return 0;
  const lv = s.lv;
  const rows = [Math.floor(s.py - K.HEIGHT + 0.25), Math.floor(s.py - 0.25)];
  const rc = Math.floor(s.px + K.HALF_W + 0.06), lc = Math.floor(s.px - K.HALF_W - 0.06);
  for (const r of rows) if (solidAt(lv, rc, r)) return 1;
  for (const r of rows) if (solidAt(lv, lc, r)) return -1;
  return 0;
}

function pickups(s) {
  const lv = s.lv;
  const c0 = Math.floor(s.px - K.HALF_W), c1 = Math.floor(s.px + K.HALF_W);
  const r0 = Math.floor(s.py - K.HEIGHT), r1 = Math.floor(s.py - 0.01);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) touch(s, c, r, false);
  if (s.wingsT > 0) {
    const R = Math.ceil(K.MAGNET), cx = Math.floor(s.px), cy = Math.floor(s.py - 0.7);
    for (let r = cy - R; r <= cy + R; r++) for (let c = cx - R; c <= cx + R; c++) {
      const dx = c + 0.5 - s.px, dy = r + 0.5 - (s.py - 0.7);
      if (dx * dx + dy * dy <= K.MAGNET * K.MAGNET) touch(s, c, r, true);
    }
  }
}

function touch(s, c, r, magnet) {
  const lv = s.lv;
  if (c < 0 || c >= lv.W || r < 0 || r >= lv.H) return;
  const ch = lv.rows[r][c];
  const i = r * lv.W + c;
  if (ch === 'o') {
    if (!s.taken[i]) { s.taken[i] = 1; s.coins++; s.events.push({ t: 'coin', x: c, y: r, magnet }); }
    return;
  }
  if (magnet) return;
  if ((ch === 'B' || ch === 'G') && !s.taken[i]) {
    s.taken[i] = 1; s.wingsT = K.WINGS; s.fire = Math.min(K.FIRE_MAX, s.fire + 3);
    if (ch === 'G') s.unlocked = true;
    s.events.push({ t: 'bible', glowing: ch === 'G', x: c, y: r });
  } else if (ch === 'C') {
    const idx = lv.checkpoints.findIndex(p => p.x === c && p.y === r);
    if (idx > s.cpIndex) { s.cpIndex = idx; s.cp = { x: c + 0.5, y: r + 1 }; s.events.push({ t: 'checkpoint', x: c, y: r }); }
  }
}

function hazards(s) {
  const lv = s.lv;
  if (s.py > lv.H + 1.5) { hurt(s); return; }
  const c0 = Math.floor(s.px - K.HALF_W + 0.1), c1 = Math.floor(s.px + K.HALF_W - 0.1);
  const r = Math.floor(s.py - 0.3);
  for (let c = c0; c <= c1; c++) if (tileAt(lv, c, r) === '^') { hurt(s); return; }
}

function demonStep(s) {
  const d = s.demon;
  if (!d) return;
  if (d.banished) { d.fade = Math.min(1, d.fade + 1 / 45); return; }
  if (s.tick < K.DEMON_DELAY) return;
  const dx = s.px - d.x;
  d.x += dx > 16 ? K.DEMON_CATCHUP : (dx < -3 ? -K.DEMON_V : K.DEMON_V);
  d.y += ((s.py - 1.6) - d.y) * 0.05;
  for (const sh of s.shots) {
    if (Math.abs(sh.x - d.x) < 1.5 && Math.abs(sh.y - d.y) < 2) {
      d.banished = true; s.banishTick = s.tick; sh.life = 0;
      s.events.push({ t: 'banish', x: d.x, y: d.y });
      return;
    }
  }
  if (s.invuln === 0 && Math.abs(s.px - d.x) < 1.1 && Math.abs((s.py - 0.7) - d.y) < 1.7) {
    s.events.push({ t: 'caught' });
    hurt(s);
  }
}

// Advance one step with the buttons held this step. Returns this step's events.
export function step(s, mask) {
  s.events = [];
  if (s.finished || s.timeUp) return s.events;
  const lv = s.lv;
  const pressed = mask & ~s.prev;
  s.prev = mask;
  s.tick++;
  if (s.invuln > 0) s.invuln--;

  if (pressed & BTN.LEFT) s.face = -1;
  if (pressed & BTN.RIGHT) s.face = 1;
  if (pressed & BTN.JUMP) s.buffer = K.BUFFER; else if (s.buffer > 0) s.buffer--;
  s.jumpHeld = !!(mask & BTN.JUMP);
  if (s.coyote > 0) s.coyote--;
  if (s.wallGrace > 0) s.wallGrace--;
  if (s.wingsT > 0) s.wingsT--;
  if (s.vaultT > 0) s.vaultT--;

  // Run
  const target = s.face * (s.wingsT > 0 ? K.WING_RUN : K.RUN);
  if (s.kickLock > 0) s.kickLock--;
  else {
    const a = s.onGround ? K.ACC_G : K.ACC_A;
    if (s.vx < target) s.vx = Math.min(target, s.vx + a);
    else if (s.vx > target) s.vx = Math.max(target, s.vx - a);
  }

  // Jump, wall kick, flap, double jump
  if (s.buffer > 0) {
    const wall = s.wallDir || (s.wallGrace > 0 ? s.graceDir : 0);
    if (s.onGround || s.coyote > 0) {
      s.vy = -K.JUMP; s.onGround = false; s.coyote = 0; s.buffer = 0; s.jumps++;
      s.events.push({ t: 'jump' });
    } else if (wall) {
      s.face = -wall; s.vx = s.face * K.RUN; s.vy = -K.KICK; s.kickLock = K.KICK_LOCK;
      s.canDouble = true; s.buffer = 0; s.wallGrace = 0; s.wallDir = 0; s.kicks++;
      s.events.push({ t: 'kick', dir: s.face });
    } else if (s.wingsT > 0) {
      s.vy = Math.min(s.vy, -K.FLAP); s.buffer = 0; s.flights++;
      s.events.push({ t: 'flap' });
    } else if (s.canDouble) {
      s.vy = -K.DJUMP; s.canDouble = false; s.buffer = 0; s.jumps++;
      s.events.push({ t: 'double' });
    }
  }

  // Gravity, short hops, wall slide, wing glide
  const wings = s.wingsT > 0;
  s.vy += wings ? K.G * 0.8 : K.G;
  if (!s.jumpHeld && s.vy < 0 && s.vaultT === 0) s.vy += K.CUT;
  const maxF = wings ? K.WING_MAXF : K.MAXF;
  if (s.vy > maxF) s.vy = maxF;
  if (s.wallDir && s.wallDir === s.face && s.vy > K.SLIDE) s.vy = K.SLIDE;

  if (s.py - K.HEIGHT < 2.2 && s.vy < 0) s.vy = 0; // sky ceiling
  const wasGround = s.onGround;
  moveX(s);
  moveY(s);
  if (wasGround && !s.onGround && s.vy >= 0) s.coyote = K.COYOTE;
  if (s.onGround) s.canDouble = true;

  const w = touchingWall(s);
  if (w) { s.wallGrace = K.WALL_GRACE; s.graceDir = w; if (!s.wallDir) s.events.push({ t: 'grab', dir: w }); }
  s.wallDir = w;

  // Angel Fire
  if ((pressed & BTN.FIRE) && s.fire > 0) {
    s.fire--;
    s.shots.push({ x: s.px + s.face * 0.5, y: s.py - 0.8, vx: s.face * K.SHOT_V, life: K.SHOT_LIFE });
    s.events.push({ t: 'fire', dir: s.face });
  }
  for (const sh of s.shots) { sh.x += sh.vx; sh.life--; if (solidAt(lv, Math.floor(sh.x), Math.floor(sh.y))) sh.life = 0; }
  if (s.shots.length) s.shots = s.shots.filter(sh => sh.life > 0);

  pickups(s);
  hazards(s);
  demonStep(s);

  if (s.px >= lv.tombX + 0.2 && s.onGround && Math.abs(s.py - (lv.tombY + 1)) < 0.5) {
    s.finished = true; s.finishTick = s.tick; s.vx = 0;
    s.events.push({ t: 'finish' });
  } else if (s.tick >= lv.limit) {
    s.timeUp = true; s.events.push({ t: 'timeup' });
  }
  return s.events;
}

// Inputs are a list of [tick, mask] changes, sorted by tick. The mask holds
// from that tick until the next change. Used by the coin server to check a run.
export function simulate(lv, inputs, opts = {}) {
  const s = createRun(lv, opts);
  let i = 0, mask = 0;
  const last = inputs.length ? inputs[inputs.length - 1][0] : 0;
  const cap = Math.min(lv.limit, Math.max(last + 600, 0));
  while (!s.finished && !s.timeUp && s.tick < cap) {
    while (i < inputs.length && inputs[i][0] <= s.tick + 1) { mask = inputs[i][1] & 15; i++; }
    step(s, mask);
  }
  return summary(s);
}

export function summary(s) {
  return { engine: ENGINE_VERSION, level: s.lv.name, finished: s.finished, ticks: s.tick,
    coins: s.coins, deaths: s.deaths, jumps: s.jumps, kicks: s.kicks, flights: s.flights,
    banishTick: s.banishTick, unlocked: s.unlocked };
}
