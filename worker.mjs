// Cloudflare Workers entry point. Settings come from the Worker's variables and secrets.
import { createApp } from './src/app.mjs';
import { shopifyStore } from './src/shopify.mjs';

let app = null;
function getApp(env) {
  if (app) return app;
  const secret = String(env.SHOPIFY_CLIENT_SECRET).trim();
  const store = shopifyStore({ shop: String(env.SHOPIFY_SHOP).trim(), clientId: String(env.SHOPIFY_CLIENT_ID).trim(), clientSecret: secret });
  app = createApp({ store, secret,
    owners: String(env.OWNER_CUSTOMER_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
    checkPriorReward: env.CHECK_PRIOR_REWARD !== 'false' });
  return app;
}

export default {
  async fetch(request, rawEnv) {
    let out;
    // The secret may be saved as SHOPIFY_CLIENT_SECRET or, in this store's Cloudflare setup, as "secret".
    const env = { ...rawEnv, SHOPIFY_CLIENT_SECRET: rawEnv.SHOPIFY_CLIENT_SECRET || rawEnv.secret };
    try {
      if (!env.SHOPIFY_SHOP || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) throw new Error('missing settings');
      const u = new URL(request.url);
      out = await getApp(env).handle({ method: request.method, url: u.pathname + u.search, body: request.method === 'POST' ? await request.text() : '' });
    } catch (e) {
      console.error(e);
      out = { status: 500, json: { message: 'Something went wrong. Please try again.' } };
    }
    return new Response(JSON.stringify(out.json), { status: out.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  },
};
