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
  "lifters",
  "triathlon-multisport",
  "travel-racecations",
]);

module.exports = { SPACE_IDS };
