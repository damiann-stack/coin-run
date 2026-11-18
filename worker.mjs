// Cloudflare Workers entry point. Settings come from the Worker's variables and secrets.
import { createApp } from './src/app.mjs';
import { shopifyStore } from './src/shopify.mjs';

let app = null;
function getApp(env) {
  if (app) return app;
  const store = shopifyStore({ shop: env.SHOPIFY_SHOP, clientId: env.SHOPIFY_CLIENT_ID, clientSecret: env.SHOPIFY_CLIENT_SECRET });
  app = createApp({ store, secret: env.SHOPIFY_CLIENT_SECRET,
    owners: String(env.OWNER_CUSTOMER_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
    checkPriorReward: env.CHECK_PRIOR_REWARD !== 'false' });
  return app;
}

export default {
  async fetch(request, env) {
    let out;
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
