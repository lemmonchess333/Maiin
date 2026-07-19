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
]);

module.exports = { SPACE_IDS };
