/**
 * Community Space ids (Spc1) — the server-side mirror of SPACE_IDS in
 * src/features/spaces/spaceDefs.ts, consumed by the account-deletion
 * executor's bounded spaces sweep (memberships + authored posts per
 * KNOWN space — no collectionGroup blast radius).
 *
 * TESTED-COPY RULE: this list is pinned set-equal to the client
 * config AND to the firestore.rules isKnownSpaceId allowlist by
 * src/features/spaces/__tests__/spaceDefs.test.ts. Adding/merging a
 * space touches all three files or CI fails.
 */
const SPACE_IDS = Object.freeze([
  "new-to-tropos",
  "hybrid-training",
  "womens-running",
  "runners",
  "trail-running",
  "lifters",
  "triathlon-multisport",
  "travel-racecations",
  // Races & Events (race-kind spaces, plan locked 2026-07-19)
  "london-marathon",
  "manchester-marathon",
  "brighton-marathon",
  "edinburgh-marathon",
  "great-north-run",
  "the-big-half",
  "royal-parks-half",
  "cardiff-half",
  "london-10000",
  "great-birmingham-run",
  "great-manchester-run",
  "leeds-10k",
  // Marathon expansion (2026-09-14)
  "yorkshire-marathon",
  "chester-marathon",
  "loch-ness-marathon",
  "newport-marathon",
  "belfast-marathon",
  "leeds-marathon",
  "milton-keynes-marathon",
  "southampton-marathon",
  "new-york-city-marathon",
  "chicago-marathon",
  "boston-marathon",
  "paris-marathon",
  "berlin-marathon",
  "dublin-marathon",
  "valencia-marathon",
  "houston-marathon",
  "seville-marathon",
  "brighton-half",
  "tokyo-marathon",
  "cambridge-half",
  "bath-half",
  "barcelona-marathon",
  "sydney-marathon",
  "amsterdam-marathon",
  "rotterdam-marathon",
  "copenhagen-marathon",
  "oxford-half",
  "great-bristol-10k",
  "edinburgh-5k",
  "river-ness-5k",
  "edinburgh-half",
  "bournemouth-half",
  "sheffield-half",
  "valencia-half",
  "edinburgh-10k",
  "bournemouth-10k",
  "lincoln-10k",
  "york-10k",
  "river-ness-10k",
  "bournemouth-5k",
  "supernova-forth-5k",
  "supernova-kelpies-5k",
  "race-to-the-king-100k",
  "race-to-the-stones-100k",
  "chiltern-50",
]);

module.exports = { SPACE_IDS };
