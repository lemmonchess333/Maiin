/**
 * R1A-Deletion Chunk 2.B — active-status drift test.
 *
 * Spec Blocker 5: prove the "active deletion" status set is identical
 * across every source that knows about it. Drift between any pair is a
 * security defect — a status that's active in the JS helper but not in
 * rules (or vice versa) creates a window where writes proceed despite
 * the executor running.
 *
 * Sources compared:
 *   1. accountDeletionStatus.js ACTIVE_DELETION_STATUSES
 *   2. firestore.rules isDeleting() status array literal
 *   3. accountDeletionLedger.js STATE_GRAPH (every status known to the
 *      executor — covers both active and inactive; this test asserts
 *      every "active" status the helper claims maps to a real state
 *      in the graph, and warns on any state in the graph that should
 *      be active but isn't).
 *
 * If a Chunk 3 executor adds a pre-running state (requested, queued,
 * preflight, lock_acquired, starting) and forgets to add it to the
 * active set, this test catches it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const require = createRequire(import.meta.url);

const status = require("../../../functions/lib/accountDeletionStatus.js");
const ledger = require("../../../functions/lib/accountDeletionLedger.js");

const rulesText = readFileSync(resolve(repoRoot, "firestore.rules"), "utf8");

/**
 * Extract the array literal inside the isDeleting() rules function.
 * The shape we expect:
 *   function isDeleting(uid) {
 *     let path = ...;
 *     return exists(path)
 *       && get(path).data.status in [
 *         'running',
 *         'failed_cleanup',
 *         ...
 *       ];
 *   }
 */
function extractRulesActiveStatuses(): string[] {
  const idx = rulesText.indexOf("function isDeleting(uid)");
  expect(idx, "firestore.rules must contain `function isDeleting(uid)`").toBeGreaterThan(-1);
  // Find the next `in [` and capture until the matching `]`.
  const inIdx = rulesText.indexOf("in [", idx);
  expect(inIdx, "isDeleting() must use `in [...]` for active-status set").toBeGreaterThan(-1);
  const closeIdx = rulesText.indexOf("]", inIdx);
  const slice = rulesText.slice(inIdx + 4, closeIdx);
  // Pick out single-quoted strings.
  const matches = slice.match(/'([a-z_]+)'/g) || [];
  return matches.map((m) => m.slice(1, -1));
}

describe("active-status drift across sources", () => {
  const jsActive = [...status.ACTIVE_DELETION_STATUSES].sort();
  const rulesActive = extractRulesActiveStatuses().sort();

  it("ACTIVE_DELETION_STATUSES is non-empty", () => {
    expect(jsActive.length).toBeGreaterThan(0);
  });

  it("rules isDeleting() array is non-empty", () => {
    expect(rulesActive.length).toBeGreaterThan(0);
  });

  it("JS helper and firestore.rules agree on the active-status set", () => {
    expect(jsActive).toEqual(rulesActive);
  });

  it("every active status is a valid status in the ledger STATE_GRAPH", () => {
    const validStatuses = Object.keys(ledger.STATE_GRAPH);
    for (const s of jsActive) {
      expect(validStatuses, `status '${s}' is active but not in STATE_GRAPH`).toContain(s);
    }
  });

  it("non-active statuses cover the expected set (requested, completed, cancelled)", () => {
    const allKnown = Object.keys(ledger.STATE_GRAPH);
    const nonActive = allKnown.filter((s) => !jsActive.includes(s)).sort();
    // The contract documented in functions/lib/accountDeletionLedger.js:
    //   requested  — lock not yet acquired
    //   completed  — cascade finished
    //   cancelled  — user backed out
    expect(nonActive).toEqual(["cancelled", "completed", "requested"]);
  });

  it("adding a new pre-running state forces a deliberate active-set update", () => {
    // This test fails fast if anyone adds a status like 'queued' /
    // 'preflight' / 'lock_acquired' / 'starting' to STATE_GRAPH without
    // explicitly placing it in the active set or the documented
    // non-active set above. Forces the implementer to think about
    // whether the new state should freeze writes.
    const allKnown = Object.keys(ledger.STATE_GRAPH).sort();
    const expectedAllKnown = [
      "cancelled",
      "completed",
      "failed_cleanup",
      "operator_review",
      "pending_auth_deletion",
      "pending_cleanup",
      "requested",
      "running",
    ];
    expect(allKnown, "STATE_GRAPH has a new status — explicitly classify it as active or non-active in this test and in firestore.rules isDeleting()").toEqual(expectedAllKnown);
  });
});
