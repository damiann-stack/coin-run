# Crown Coin Run coin counter

The server behind **Play for coins** in the new Crown Coin Run on crownsandcrossesco.com.

The game in the browser records every button press. When a coin run ends, this counter
replays the run with the same game engine and the same random seed it handed out at the
start, so it counts only coins the player really collected. Nobody can just send a big number.

## Rules (same as the current coin game)

- Only finished runs save coins (reach the tomb).
- 8 runs, then new runs open 24 hours after the eighth. Owner accounts get unlimited runs.
- Level 4 opens for coin runs once a Level 3 coin run finds the glowing Bible.
- 2,500 coins plus one finished run of each of Levels 1, 2 and 3 unlock **$3 USD store credit**, once per account.
  Before giving it, the counter also checks the customer's store credit history and refuses if a $3.00 credit is
  already there (so someone who got the reward from the old game can't get it twice). Set `CHECK_PRIOR_REWARD=false` to turn that off.
- The rules live in `src/rules.mjs`.

Each player's coins, runs and reward are saved on their own Shopify customer record (an app-owned metafield),
so there is no separate database. Store credit is given with Shopify's `storeCreditAccountCredit`.

## Switching it on

1. **Create the app in Shopify.** In the Shopify Dev Dashboard, create an app named "Crown Coin Run Counter".
   Create a version with these access scopes:
   `read_customers, write_customers, read_store_credit_account_transactions, write_store_credit_account_transactions, write_app_proxy`.
   In the same version, set the **App proxy**: prefix `apps`, subpath `coin-run`, URL = your Worker address from step 2
   (you can come back and fill it in). Release the version and install the app on the store.
2. **Run the counter on Cloudflare Workers.** In Cloudflare, go to Workers, create an application and import this
   GitHub repository (branch `coin-server`). `wrangler.toml` already sets the store name.
   Add two **secrets** in the Worker's settings, copied from the app's settings page in the Dev Dashboard:
   `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`. Never put them in this repository.
   Optional variable: `OWNER_CUSTOMER_IDS` (customer IDs with unlimited runs, comma separated).
3. **Check it.** Open `https://<your-worker>/health` and you should see `{"ok":true,...}`. Then, signed in on the
   store, open the game and the **Play for coins** tab. It shows your coins and runs left instead of "open soon".

The theme already points the game at `/apps/coin-run` (theme editor > Discover section > "New Coin Run counter path").
Until the counter answers there, the coin tab keeps offering the current coin game.

Cloudflare's free plan limits how much work one request may do. A run replay usually takes a few milliseconds,
but if runs ever fail to count, the paid Workers plan raises that limit. The same code also runs on any Node 20+
host with `npm start` and the same settings as environment variables (`SHOPIFY_SHOP` included).

## Development

```
npm test
```

`src/engine.mjs` and `src/levels.mjs` must stay identical to the copies built into the theme's
`assets/crown-coin-run-2.js`. If the game's physics or levels change, bump `ENGINE_VERSION` in both.
