// Crown Coin Run 2 levels, built from small pieces so they are easy to change.
// Tiles: # stone, R tomb rock, ^ thorns, o coin, B Bible (wings + Angel Fire),
// G glowing Bible (also opens Level 4), C checkpoint, T tomb door, P start.

const H = 24;

class Builder {
  constructor(name) { this.name = name; this.cols = []; this.hints = []; this.g = 16; }
  get x() { return this.cols.length; }
  col() { const c = new Array(H).fill('.'); this.cols.push(c); return c; }
  put(x, y, ch) { if (y >= 0 && y < H) this.cols[x][y] = ch; }
  block(x, y0, y1, ch = '#') { for (let y = y0; y <= y1; y++) this.put(x, y, ch); }
  setG(g) { this.g = Math.max(9, Math.min(19, g)); }
  ground(n, { coins = false, g } = {}) {
    if (g !== undefined) this.setG(g);
    const x0 = this.x;
    for (let i = 0; i < n; i++) { const c = this.col(); for (let y = this.g; y < H; y++) c[y] = '#'; }
    if (coins) for (let i = 2; i < n - 1; i += 2) this.put(x0 + i, this.g - 2, 'o');
    return x0;
  }
  pit(w, arc = true) {
    const x0 = this.x;
    for (let i = 0; i < w; i++) this.col();
    if (arc) for (let i = 0; i < w; i++) this.put(x0 + i, this.g - 3 - (i > 0 && i < w - 1 ? 1 : 0), 'o');
    return x0;
  }
  // A narrow pit with a floor. Fall in, then bounce wall to wall to get out.
  well(w = 3, depth = 7) {
    const x0 = this.x, bottom = Math.min(H - 1, this.g + depth);
    for (let i = 0; i < w; i++) { const c = this.col(); for (let y = bottom; y < H; y++) c[y] = '#'; }
    for (let i = 0; i < w; i++) this.put(x0 + i, bottom - 1, 'o');
    this.put(x0 + (w >> 1), bottom - 4, 'o');
    return x0;
  }
  thorns(x0, n) { for (let i = 0; i < n; i++) this.put(x0 + i, this.g - 1, '^'); }
  step(x, h = 1) { this.block(x, this.g - h, this.g - 1); }
  checkpoint(x) { this.put(x, this.g - 1, 'C'); }
  hint(x, y, t) { this.hints.push({ x, y, t }); }
  // Two hanging walls make a shaft. Bounce up it to a high path with treasure;
  // the low path runs underneath past thorns.
  branch(length = 22, { item = '', gap = 3, rise = 8, thorns = true } = {}) {
    const a = this.x, top = this.g - rise;
    this.ground(length + gap + 3);
    this.block(a, top - 4, this.g - 4);
    this.block(a + gap + 1, top, this.g - 4);
    for (let x = a + gap + 1; x < a + gap + 1 + length; x++) this.put(x, top, '#');
    for (let x = a + gap + 3; x < a + gap + length; x += 2) this.put(x, top - 1, 'o');
    if (item) this.put(a + gap + 1 + (length >> 1), top - 1, item);
    if (thorns) { this.thorns(a + gap + 7, 2); this.thorns(a + gap + 15, 2); }
    this.put(a + gap + 11, this.g - 3, 'o'); this.put(a + gap + 19, this.g - 3, 'o');
    return a;
  }
  // A cliff too tall to jump, with a hanging pillar beside it to bounce off.
  cliff(rise = 7, run = 10, gap = 3) {
    const a = this.ground(gap + 1);
    this.block(a, this.g - rise - 2, this.g - 4);
    this.ground(run, { coins: true, g: this.g - rise });
    return a;
  }
  drop(fall = 7, run = 10) { return this.ground(run, { coins: true, g: this.g + fall }); }
  // An empty tomb cut into the rock. Reaching the door ends the level.
  tomb() {
    this.ground(5);
    const x0 = this.ground(8);
    this.put(x0 + 7, this.g - 1, 'T');
    for (let i = 0; i < 6; i++) { const c = this.col(); for (let y = 0; y < H; y++) c[y] = 'R'; }
    return x0;
  }
  build(extra = {}) {
    const rows = [];
    for (let y = 0; y < H; y++) rows.push(this.cols.map(c => c[y]).join(''));
    return { name: this.name, rows, hints: this.hints, ...extra };
  }
}

function level1() {
  const b = new Builder('Level 1');
  b.ground(20, { coins: true }); b.put(3, b.g - 1, 'P');
  b.hint(5, b.g - 6, 'You run on your own. Tap or press Space to jump. Hold it to jump higher.');
  b.step(14);
  b.pit(3); b.ground(12, { coins: true });
  b.hint(b.x - 10, b.g - 6, 'Tap again in the air for a double jump.');
  b.pit(5); b.ground(8, { coins: true }); b.checkpoint(b.x - 4);
  b.ground(3);
  const w = b.well(3, 7);
  b.hint(w - 6, b.g - 7, 'Fell in a pit? Jump at a wall, then tap again to bounce off it.');
  b.ground(8, { coins: true });
  const br = b.branch(22, { item: 'B' });
  b.hint(br - 4, b.g - 13, 'Bounce up between the walls to find the high road.');
  b.pit(4); b.ground(10, { coins: true }); b.checkpoint(b.x - 6);
  const c = b.cliff(7, 12);
  b.hint(c - 8, b.g + 2, 'Too tall? Bounce up the gap. Arrow keys turn you around.');
  b.pit(4); b.ground(6, { coins: true });
  b.drop(7, 10);
  b.tomb();
  return b.build();
}

function level2() {
  const b = new Builder('Level 2');
  b.ground(14, { coins: true }); b.put(3, b.g - 1, 'P');
  b.pit(4); b.ground(6, { coins: true });
  b.well(3, 7); b.ground(6); b.thorns(b.x - 4, 2);
  b.ground(4); b.checkpoint(b.x - 2);
  b.branch(26, { item: 'B' });
  b.pit(4); b.ground(3); b.pit(4); b.ground(8, { coins: true });
  b.cliff(7, 10);
  b.well(3, 7); b.ground(6, { coins: true }); b.checkpoint(b.x - 3);
  b.pit(5); b.ground(4);
  b.drop(7, 8);
  b.well(4, 7); b.ground(8, { coins: true }); b.thorns(b.x - 4, 2);
  b.ground(3); b.step(b.x - 1);
  b.cliff(6, 8); b.pit(4); b.ground(4); b.drop(6, 8);
  b.tomb();
  return b.build();
}

function level3() {
  const b = new Builder('Level 3');
  b.ground(10, { coins: true }); b.put(2, b.g - 1, 'P');
  b.pit(5); b.ground(3); b.pit(5); b.ground(6, { coins: true });
  b.cliff(7, 8);
  b.pit(5); b.ground(4); b.checkpoint(b.x - 2);
  b.drop(7, 11);
  b.branch(28, { item: 'G', rise: 10 });
  b.pit(5); b.ground(4); b.thorns(b.x - 3, 1);
  b.well(3, 7); b.ground(3); b.well(3, 7); b.ground(6, { coins: true }); b.checkpoint(b.x - 3);
  b.cliff(7, 8);
  b.pit(5); b.ground(3); b.pit(5); b.ground(4);
  b.drop(7, 11);
  b.branch(20, { item: 'B' });
  b.well(3, 7); b.ground(4);
  b.tomb();
  return b.build();
}

function level4() {
  const b = new Builder('Level 4 · Shadow Chase');
  b.ground(16, { coins: true }); b.put(3, b.g - 1, 'P'); b.put(7, b.g - 1, 'B');
  b.hint(5, b.g - 7, 'Run! The shadow is coming. With a Bible, turn around and press F for Angel Fire.');
  b.pit(4); b.ground(8, { coins: true });
  b.well(3, 6); b.ground(6, { coins: true }); b.checkpoint(b.x - 3);
  b.branch(22, { item: 'B', thorns: false });
  b.pit(4); b.ground(6, { coins: true });
  b.cliff(7, 8);
  b.drop(7, 6);
  b.ground(4); b.checkpoint(b.x - 2); b.put(b.x - 1, b.g - 1, 'B');
  b.pit(4); b.ground(6, { coins: true });
  b.well(3, 6); b.ground(8, { coins: true }); b.put(b.x - 4, b.g - 1, 'B');
  b.pit(4); b.ground(6);
  b.tomb();
  return b.build({ chase: true, limitSeconds: 300 });
}

export const LEVELS = [level1(), level2(), level3(), level4()];

// ---------- practice levels 1 to 30 ----------
// Level 1 is the tutorial. Levels 2 to 30 are built from the same pieces with a
// fixed random seed per level, so the game and the coin counter build identical
// maps. Difficulty climbs gently: longer levels, wider pits and more kinds of
// pieces, topping out near Level 3 above. Levels 10 and 20 are shadow chases.
function practiceRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function practiceLevel(n) {
  if (n === 1) return { ...level1(), name: 'Level 1' };
  const d = (n - 2) / 28;
  const r = practiceRng(0x5eed + n * 7919);
  const ri = (a, z) => a + Math.floor(r() * (z - a + 1));
  const chase = n === 10 || n === 20;
  const name = n === 30 ? 'Level 30 · The Empty Tomb' : chase ? `Level ${n} · Shadow Chase` : `Level ${n}`;
  const b = new Builder(name);
  b.ground(14, { coins: true }); b.put(3, b.g - 1, 'P');
  if (chase) { b.put(7, b.g - 1, 'B'); b.hint(5, b.g - 7, 'The shadow is coming. Grab the Bible, turn around and press F for Angel Fire.'); }
  const pool = ['pit', 'step', 'flat', 'pit'];
  if (n >= 3) pool.push('well');
  if (n >= 4) pool.push('thorns');
  if (n >= 6) pool.push('branch');
  if (n >= 8) pool.push('cliff');
  if (n >= 9) pool.push('drop');
  if (n >= 14) pool.push('pits');
  if (n >= 18) pool.push('wells');
  const segs = 5 + Math.round(d * 11);
  // Level 30 is a set finale that uses every piece once or twice.
  const finale = ['pit', 'well', 'flat', 'thorns', 'branch', 'pits', 'cliff', 'drop', 'wells', 'step', 'pits', 'cliff', 'thorns', 'drop', 'well', 'pit'];
  let since = 0, last = '';
  for (let i = 0; i < segs; i++) {
    let p = pool[Math.floor(r() * pool.length)];
    if (p === last) p = pool[Math.floor(r() * pool.length)];
    if (n === 30) p = finale[i % finale.length];
    const rise = Math.min(7, 5 + Math.round(d * 2)), fall = Math.min(7, 4 + Math.round(d * 3));
    if (p === 'cliff' && b.g - rise < 10) p = 'drop';
    if (p === 'drop' && b.g + fall > 18) p = b.g - rise >= 10 && n >= 8 ? 'cliff' : 'flat';
    if (p === 'branch' && b.g < 13) p = 'pit';
    last = p;
    const pw = Math.max(2, Math.min(5, 2 + Math.round(d * 2.6 + r() * 0.9)));
    switch (p) {
      case 'pit': b.pit(pw); b.ground(ri(5, 9), { coins: true }); break;
      case 'step': b.ground(4); b.step(b.x - 2, d > 0.4 ? 2 : 1); b.ground(ri(5, 8), { coins: true }); break;
      case 'flat': b.ground(ri(8, 12), { coins: true }); break;
      case 'well': b.ground(3); b.well(3, Math.min(7, 5 + Math.round(d * 2))); b.ground(ri(5, 8), { coins: true }); break;
      case 'thorns': b.ground(ri(6, 9), { coins: true }); b.thorns(b.x - 4, d > 0.5 ? 2 : 1); b.ground(3); break;
      case 'branch': b.branch(ri(18, 24), { item: r() < 0.6 ? 'B' : '', thorns: d > 0.3 }); break;
      case 'cliff': b.cliff(rise, ri(8, 10)); break;
      case 'drop': b.drop(fall, ri(8, 10)); break;
      case 'pits': b.pit(pw); b.ground(3); b.pit(pw); b.ground(ri(5, 7), { coins: true }); break;
      case 'wells': b.ground(3); b.well(3, 7); b.ground(3); b.well(3, 7); b.ground(ri(5, 7), { coins: true }); break;
    }
    if (++since >= 3 && i < segs - 1) {
      b.ground(4); b.checkpoint(b.x - 2); since = 0;
      if (chase) b.put(b.x - 1, b.g - 1, 'B');
    }
  }
  b.ground(4);
  b.tomb();
  return b.build(chase ? { chase: true, limitSeconds: 300 } : {});
}

export const PRACTICE_LEVELS = Array.from({ length: 30 }, (_, i) => practiceLevel(i + 1));
export const PRIZE_LEVEL = 29;
