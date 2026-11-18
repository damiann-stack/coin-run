import assert from 'node:assert/strict';
import worker from '../worker.mjs';
const r = await worker.fetch(new Request('https://w.example/health'), { SHOPIFY_SHOP: 's.myshopify.com', SHOPIFY_CLIENT_ID: 'a', SHOPIFY_CLIENT_SECRET: 'b' });
assert.equal(r.status, 200); assert.equal((await r.json()).ok, true);
const r2 = await worker.fetch(new Request('https://w.example/balance?shop=s&signature=00'), { SHOPIFY_SHOP: 's.myshopify.com', SHOPIFY_CLIENT_ID: 'a', SHOPIFY_CLIENT_SECRET: 'b' });
assert.equal(r2.status, 403);
console.log('worker entry ok');
