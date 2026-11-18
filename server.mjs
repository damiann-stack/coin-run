import { createServer } from 'node:http';
import { createApp } from './src/app.mjs';
import { shopifyStore } from './src/shopify.mjs';

const env = process.env;
for (const k of ['SHOPIFY_SHOP', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET']) if (!env[k]) { console.error(`Missing setting ${k}`); process.exit(1); }
const store = shopifyStore({ shop: env.SHOPIFY_SHOP, clientId: env.SHOPIFY_CLIENT_ID, clientSecret: env.SHOPIFY_CLIENT_SECRET });
const app = createApp({ store, secret: env.SHOPIFY_CLIENT_SECRET, owners: (env.OWNER_CUSTOMER_IDS || '').split(',').map(s => s.trim()).filter(Boolean), checkPriorReward: env.CHECK_PRIOR_REWARD !== 'false' });

createServer(async (req, res) => {
  let body = '';
  req.on('data', c => { body += c; if (body.length > 400000) req.destroy(); });
  req.on('end', async () => {
    let out;
    try { out = await app.handle({ method: req.method, url: req.url, body }); }
    catch (e) { console.error(e); out = { status: 500, json: { message: 'Something went wrong. Please try again.' } }; }
    res.writeHead(out.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(out.json));
  });
}).listen(env.PORT || 3000, () => console.log(`Crown Coin Run counter listening on ${env.PORT || 3000}`));
