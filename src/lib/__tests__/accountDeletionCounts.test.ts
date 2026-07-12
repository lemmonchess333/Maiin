/**
 * R1A-Deletion Chunk 1.1 — inventory count assertions.
 *
 * The Chunk 1 report had a count mismatch (claimed 33 included, actually
 * 38). Counts must now be programmatically guarded — changing inventory
 * size requires deliberately updating these constants AND the report
 * must read counts from the inventory JSON rather than typing them by
 * hand.
 *
 * If you intentionally added or removed an inventory entry, update the
 * EXPECTED_* constant in the same commit. Drift between constant and
 * inventory size fails fast here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const inventoryPath = resolve(
  here,
  "../../../functions/accountDeletionInventory.json"
);
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));

/**
 * AUTHORITATIVE COUNTS — change these together with inventory edits.
 *
 * Chunk 1.1 baseline:
 *   - 40 included entries (was 33 in Chunk 1; expanded to handle content-ID
 *     references for kudos/comments on user's own activities, plus
 *     userPublicSubcollection replacing userPublicProfile to catch any
 *     future doc under public/).
 *   - 7 excluded entries (was 6; added deletedBillingIdentities as a
 *     separate billing-identity tombstone per Chunk 1.1 founder-decision
 *     #8).
 */
// S4e (PR #722) bumped to 41 — added globalRestrictedUids entry for
// the restricted-user marker cleanup.
// SOCIAL S3 bumped to 42 — added partnerBondsMember entry for the
// partner-streak bond cleanup (cross-user edge, deleteQueryInBatches).
// GOALS-CORE-01 cleanup bumped to 46 — userJourneys +
// userNutritionCommitments (both were already swept by the executor
// but undocumented in the inventory) plus goalSpaceMemberships +
// goalSpaceEventsAuthored (executor step goal_spaces,
// lib/goalSpaceCleanup — the membership/counter/event cleanup the
// foundation PR #1545 deferred).
export const EXPECTED_INCLUDED_COUNT = 47;
export const EXPECTED_EXCLUDED_COUNT = 7;

describe("inventory counts are programmatically guarded", () => {
  it("included entries length matches EXPECTED_INCLUDED_COUNT", () => {
    expect(inventory.included.length).toBe(EXPECTED_INCLUDED_COUNT);
  });

  it("excluded entries length matches EXPECTED_EXCLUDED_COUNT", () => {
    expect(inventory.excluded.length).toBe(EXPECTED_EXCLUDED_COUNT);
  });

  it("no duplicate keys across included + excluded", () => {
    const keys = [
      ...inventory.included.map((e: { key: string }) => e.key),
      ...inventory.excluded.map((e: { key: string }) => e.key),
    ];
    const dupes: string[] = [];
    const seen = new Set<string>();
    for (const k of keys) {
      if (seen.has(k)) dupes.push(k);
      seen.add(k);
    }
    expect(dupes).toEqual([]);
  });

  it("no duplicate (target, strategy) pairs in included entries", () => {
    interface InclEntry {
      key: string;
      path?: string;
      pathFilter?: string;
      collectionGroup?: string;
      sourcePath?: string;
      perActivityCleanup?: string;
      strategy?: string;
    }
    // Build a precise target identifier. Different inventory entry types
    // use different keying fields: pathFilter for collectionGroup, path
    // for direct paths, sourcePath for per-edge cleanups, perActivityCleanup
    // for content-ID reference cleanups. Use whichever field uniquely
    // identifies the deletion target so two distinct entries don't
    // collide on a coarser key (e.g. collectionGroup "users" appears in
    // both blocksReverse and kudosByMe but their pathFilters differ).
    const pairs = (inventory.included as InclEntry[]).map((e) => {
      const target =
        e.pathFilter ||
        e.path ||
        e.sourcePath ||
        e.perActivityCleanup ||
        e.collectionGroup ||
        "<unknown>";
      return `${e.key}::${target}::${e.strategy || "<no-strategy>"}`;
    });
    // The key is in the dedupe identifier so we're really checking that
    // (target, strategy) doesn't repeat across distinct keys.
    const targetStrategyPairs = (inventory.included as InclEntry[]).map((e) => {
      const target =
        e.pathFilter ||
        e.path ||
        e.sourcePath ||
        e.perActivityCleanup ||
        e.collectionGroup ||
        "<unknown>";
      return `${target}::${e.strategy || "<no-strategy>"}`;
    });
    const dupes: string[] = [];
    const seen = new Set<string>();
    for (const p of targetStrategyPairs) {
      if (seen.has(p)) dupes.push(p);
      seen.add(p);
    }
    expect(dupes).toEqual([]);
    // also assert unique keys (defence-in-depth)
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});

describe("inventory shape is consumable by report regeneration", () => {
  it("counts derived from inventory match the constants — report counts can be regenerated from JSON", () => {
    const derivedIncluded = inventory.included.length;
    const derivedExcluded = inventory.excluded.length;
    // This is the contract that fixes the Chunk 1 'INCLUDED: 33 but list shows 38' bug:
    // the report MUST be generated from this number, never typed by hand.
    expect(derivedIncluded).toBe(EXPECTED_INCLUDED_COUNT);
    expect(derivedExcluded).toBe(EXPECTED_EXCLUDED_COUNT);
  });

  it("every included entry has a unique testCoverageKey", () => {
    const keys = (inventory.included as { testCoverageKey?: string }[]).map(
      (e) => e.testCoverageKey
    );
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const k of keys) {
      if (!k) continue;
      if (seen.has(k)) dupes.push(k);
      seen.add(k);
    }
    expect(dupes).toEqual([]);
  });
});
