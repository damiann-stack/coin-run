// The coin rules. Keep these the same as the store's current coin game.
export const RULES = {
  rewardCoins: 2500,          // coins needed for the reward
  rewardAmount: '3.00',       // store credit in USD
  rewardCurrency: 'USD',
  clearLevels: [0, 1, 2],     // levels 1-3 must each be cleared once in a counted run
  attemptsPerWindow: 8,       // runs before a lockout
  lockoutMs: 24 * 60 * 60 * 1000, // after the eighth run, new runs open 24 hours later
  runTtlMs: 30 * 60 * 1000,   // a started run must be finished within 30 minutes
  maxOpenRuns: 3,
};

// The practice Level 30 prize: free shipping plus one free Embroidered Patch,
// as two single-use codes that only the winner's account can use.
export const PRIZE = {
  level: 29,                                                   // practice level index (Level 30)
  giftVariant: 'gid://shopify/ProductVariant/68249134760173',  // Embroidered Patches
  giftName: 'Embroidered Patch',
  runTtlMs: 60 * 60 * 1000,                                    // a started Level 30 run must be sent within an hour
  maxOpenRuns: 3,
};
