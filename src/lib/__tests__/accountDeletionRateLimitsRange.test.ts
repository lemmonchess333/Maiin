/**
 * R1A-Deletion Chunk 1.1 — rateLimits range-query semantics.
 *
 * The deletion executor (Chunk 3) cleans rateLimits via a range query
 * on documentId. The pattern relies on documentId being precisely
 * `${uid}_${action}` with underscore as a delimiter. This test pins the
 * range-query semantics so a future change to either the doc-id pattern
 * OR the executor query shape fails fast.
 *
 * Verified pattern (functions/index.js:129):
 *   admin.firestore().collection("rateLimits").doc(`${uid}_${action}`)
 *
 * Range query semantics (Chunk 3 executor will use):
 *   query(
 *     collection("rateLimits"),
 *     where(FieldPath.documentId(), ">=", `${uid}_`),
 *     where(FieldPath.documentId(), "<", `${uid}_`),
 *   )
 *
 * Why : Firebase's documented sentinel for "after any unicode
 * character" — guarantees the upper bound captures every doc-id whose
 * prefix is `${uid}_`.
 */
import { describe, it, expect } from "vitest";

/**
 * Pure-function model of the range filter. Returns true if `docId` falls
 * within the half-open range [`${uid}_`, `${uid}_`).
 *
 * Mirrors what Firestore will do server-side on the range query — used
 * here to assert the pattern selects the right docs (and ONLY the right
 * docs) without booting the emulator.
 */
function rateLimitsRangeFilter(uid: string, docId: string): boolean {
  const lower = `${uid}_`;
  const upper = `${uid}_`;
  return docId >= lower && docId < upper;
}

describe("rateLimits range-query semantics", () => {
  const uid = "alice123";

  it("selects ${uid}_analyzeFood — the canonical pattern", () => {
    expect(rateLimitsRangeFilter(uid, `${uid}_analyzeFood`)).toBe(true);
  });

  it("selects ${uid}_analyzeFoodText", () => {
    expect(rateLimitsRangeFilter(uid, `${uid}_analyzeFoodText`)).toBe(true);
  });

  it("selects ${uid}_onboarding", () => {
    expect(rateLimitsRangeFilter(uid, `${uid}_onboarding`)).toBe(true);
  });

  it("selects ${uid}_askGemini, ${uid}_checkout, ${uid}_computePerformance", () => {
    expect(rateLimitsRangeFilter(uid, `${uid}_askGemini`)).toBe(true);
    expect(rateLimitsRangeFilter(uid, `${uid}_checkout`)).toBe(true);
    expect(rateLimitsRangeFilter(uid, `${uid}_computePerformance`)).toBe(true);
  });

  it("does NOT select a similarly-prefixed UID (alice124_analyzeFood)", () => {
    expect(rateLimitsRangeFilter(uid, "alice124_analyzeFood")).toBe(false);
  });

  it("does NOT select the target uid itself if no underscore (bare uid doc)", () => {
    // If a bare-uid doc existed, it would NOT be picked up. Per the audit,
    // functions/index.js:129 always writes `${uid}_${action}` — there are
    // no bare-uid docs in rateLimits today. If the pattern ever changes,
    // either this test or the executor will need an update.
    expect(rateLimitsRangeFilter(uid, uid)).toBe(false);
  });

  it("does NOT select an unrelated key (admin_globalRate)", () => {
    expect(rateLimitsRangeFilter(uid, "admin_globalRate")).toBe(false);
  });

  it("does NOT select an action-only key (no uid prefix)", () => {
    expect(rateLimitsRangeFilter(uid, "_analyzeFood")).toBe(false);
  });

  it("selects every action with the right uid prefix", () => {
    const actions = ["a", "b", "c", "z", "zzzzz", "anyAction", "with_underscores"];
    for (const action of actions) {
      expect(rateLimitsRangeFilter(uid, `${uid}_${action}`)).toBe(true);
    }
  });

  it("UPPER BOUND: the \\uf8ff sentinel works for the highest practical action name", () => {
    // Even an action with a max-codepoint name should sort below the sentinel.
    const action = ""; // one below the sentinel
    expect(rateLimitsRangeFilter(uid, `${uid}_${action}`)).toBe(true);
  });

  it("UPPER BOUND: a candidate equal to the sentinel itself is excluded (half-open range)", () => {
    expect(rateLimitsRangeFilter(uid, `${uid}_`)).toBe(false);
  });
});

describe("docId pattern audit pin (functions/index.js:129)", () => {
  it("the documented pattern is `${uid}_${action}` with underscore delimiter — verify via construction", () => {
    const uid = "user_with_underscores";
    const action = "checkout";
    const docId = `${uid}_${action}`;
    expect(docId).toBe("user_with_underscores_checkout");
    // This is the case the executor must handle: a uid containing underscores
    // still produces a unique-by-action doc-id because uid is fully prefixed
    // before the trailing underscore.
    expect(rateLimitsRangeFilter(uid, docId)).toBe(true);
  });

  it("a uid that is a prefix of another uid does not over-match", () => {
    expect(rateLimitsRangeFilter("alice", "alice_checkout")).toBe(true);
    // "alicebob_checkout" SHOULD NOT match the uid "alice" because the
    // delimiter is the first underscore after the uid. The range filter
    // catches this because "alicebob_checkout" >= "alice_" lexicographically
    // but ALSO >= "alice_" (since 'b' > '_' in codepoint order... wait
    // _ is 0x5F, 'b' is 0x62, so "aliceb" > "alice_" ALPHABETICALLY in
    // ASCII).
    expect(rateLimitsRangeFilter("alice", "alicebob_checkout")).toBe(false);
  });
});
