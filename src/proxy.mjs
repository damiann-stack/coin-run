import { createHmac, timingSafeEqual } from 'node:crypto';

// Checks the signature Shopify adds to every app proxy request.
// Returns { shop, customerId } when valid, or null.
export function verifyProxy(url, secret, { now = Date.now(), maxAgeSec = 300 } = {}) {
  const u = new URL(url, 'https://x.invalid');
  const sig = u.searchParams.get('signature');
  if (!sig || !secret) return null;
  const groups = new Map();
  for (const [k, v] of u.searchParams) {
    if (k === 'signature') continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(v);
  }
  const message = [...groups].map(([k, vs]) => `${k}=${vs.join(',')}`).sort().join('');
  const want = createHmac('sha256', secret).update(message).digest('hex');
  const a = Buffer.from(want, 'utf8'), b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const tsRaw = u.searchParams.get('timestamp');
  const ts = tsRaw ? Number(tsRaw) : NaN;
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > maxAgeSec) return null;
  return { shop: u.searchParams.get('shop') || '', customerId: u.searchParams.get('logged_in_customer_id') || '' };
}

// Used by the tests to build a request the way Shopify would.
export function signProxy(path, params, secret) {
  const groups = Object.entries(params).map(([k, v]) => `${k}=${v}`).sort().join('');
  const signature = createHmac('sha256', secret).update(groups).digest('hex');
  const q = new URLSearchParams({ ...params, signature });
  return `${path}?${q}`;
}
