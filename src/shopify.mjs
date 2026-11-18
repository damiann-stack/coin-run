// Saves each player's coin record on their Shopify customer (an app-owned
// metafield), and gives store credit through the Admin API. No database needed.
const API = '2026-10';
const NS = '$app:coin_run', KEY = 'state';

export function shopifyStore({ shop, clientId, clientSecret, fetchImpl = fetch }) {
  let token = null, tokenUntil = 0;
  async function getToken() {
    if (token && Date.now() < tokenUntil) return token;
    const r = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    });
    if (!r.ok) throw new Error(`token request failed (${r.status})`);
    const d = await r.json();
    token = d.access_token; tokenUntil = Date.now() + Math.max(60, (d.expires_in || 3600) - 300) * 1000;
    return token;
  }
  async function gql(query, variables) {
    const r = await fetchImpl(`https://${shop}/admin/api/${API}/graphql.json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await getToken() },
      body: JSON.stringify({ query, variables }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.errors) throw new Error(`Admin API error (${r.status}): ${JSON.stringify(d.errors || d).slice(0, 300)}`);
    return d.data;
  }
  const gid = id => `gid://shopify/Customer/${id}`;
  return {
    async load(customerId) {
      const d = await gql(`query($id: ID!) { customer(id: $id) { id metafield(namespace: "${NS}", key: "${KEY}") { value compareDigest } } }`, { id: gid(customerId) });
      if (!d.customer) return null;
      const m = d.customer.metafield;
      return { state: m ? JSON.parse(m.value) : null, digest: m ? m.compareDigest : null };
    },
    // Saves only if nobody else changed the record since it was loaded.
    async save(customerId, state, digest) {
      const d = await gql(`mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { metafields { compareDigest } userErrors { field message code } } }`,
        { m: [{ ownerId: gid(customerId), namespace: NS, key: KEY, type: 'json', value: JSON.stringify(state), compareDigest: digest }] });
      const errs = d.metafieldsSet.userErrors;
      if (errs.length) { if (errs.some(e => /STALE|stale|digest/i.test(`${e.code} ${e.message}`))) return { ok: false, conflict: true }; throw new Error(errs.map(e => e.message).join('; ')); }
      return { ok: true, digest: d.metafieldsSet.metafields[0].compareDigest };
    },
    // True if the customer already has a store credit of exactly the reward amount.
    async hasPriorReward(customerId, amount, currency) {
      const d = await gql(`query($id: ID!) { customer(id: $id) { storeCreditAccounts(first: 5) { nodes { balance { currencyCode } transactions(first: 100) { nodes { __typename amount { amount currencyCode } } } } } } }`, { id: gid(customerId) });
      for (const a of d.customer?.storeCreditAccounts?.nodes || [])
        for (const t of a.transactions.nodes)
          if (t.__typename === 'StoreCreditAccountCreditTransaction' && Number(t.amount.amount) === Number(amount) && t.amount.currencyCode === currency) return true;
      return false;
    },
    async credit(customerId, amount, currency) {
      const d = await gql(`mutation($id: ID!, $c: StoreCreditAccountCreditInput!) { storeCreditAccountCredit(id: $id, creditInput: $c) { storeCreditAccountTransaction { id } userErrors { field message } } }`,
        { id: gid(customerId), c: { creditAmount: { amount, currencyCode: currency }, notify: true } });
      const p = d.storeCreditAccountCredit;
      if (p.userErrors.length) throw new Error(p.userErrors.map(e => e.message).join('; '));
      return { txId: p.storeCreditAccountTransaction?.id || '' };
    },
  };
}

// In-memory stand-in with the same behaviour, for tests and local runs.
export function memoryStore() {
  const rows = new Map(); let n = 0; const credits = [];
  return {
    credits, rows,
    async load(id) { const r = rows.get(id); return r ? { state: JSON.parse(r.v), digest: r.d } : { state: null, digest: null }; },
    async save(id, state, digest) {
      const r = rows.get(id);
      if ((r ? r.d : null) !== (digest ?? null)) return { ok: false, conflict: true };
      const d = `d${++n}`; rows.set(id, { v: JSON.stringify(state), d }); return { ok: true, digest: d };
    },
    async hasPriorReward(id, amount) { return credits.some(c => c.id === id && c.amount === amount); },
    async credit(id, amount, currency) { credits.push({ id, amount, currency }); return { txId: `tx${credits.length}` }; },
  };
}
