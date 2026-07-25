/**
 * challenge.participantCount — write ordering.
 *
 * `recomputeParticipantCount` reads a `.count()` aggregate then writes it.
 * Those are two operations, so two concurrent membership triggers can
 * interleave:
 *
 *   join  fires, counts 5
 *   leave fires, counts 4, writes 4
 *   join's write lands second, writes 5   ← stored 5, actual 4
 *
 * The lost-update shape of 23369ef. The function's own comment used to claim
 * "concurrent membership changes converge (the last trigger to run observes
 * the final set)" — which assumes read order equals write order, and it
 * doesn't.
 *
 * The guard is a MAX on the SOURCE WRITE's commit time (`context.timestamp`,
 * assigned by Firestore rather than by an instance clock, so it orders the
 * triggers authoritatively). CLAUDE.md names MIN/MAX-style updates as the
 * naturally-safe exception to the transaction-plus-marker rule, and it keeps
 * the O(1) read cost that a transactional recompute would lose.
 *
 * These pin the ordering rule itself. The Firestore-backed wrapper is
 * emulator territory, matching the convention in
 * dailyRaceReconciliationSweep.test.js.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || "tropos-unit-test",
  });
}

const { _shouldApplyParticipantCount } = require("../index");

const T0 = new Date("2026-07-25T12:00:00Z").getTime();
const LATER = T0 + 250; // a quarter-second apart — a realistic interleave

describe("_shouldApplyParticipantCount", () => {
  it("writes when nothing has been observed yet", () => {
    // First ever count for a challenge, or a doc written before the guard
    // existed — it must not be frozen out by a missing marker.
    expect(_shouldApplyParticipantCount(T0, 0)).toBe(true);
    expect(_shouldApplyParticipantCount(T0, undefined)).toBe(true);
  });

  it("writes a NEWER observation over an older one", () => {
    expect(_shouldApplyParticipantCount(LATER, T0)).toBe(true);
  });

  it("DROPS an older observation — the lost update", () => {
    // The join trigger read first but is writing last. Its count predates
    // the leave, so letting it land would restore a stale value.
    expect(_shouldApplyParticipantCount(T0, LATER)).toBe(false);
  });

  it("writes on re-delivery of the SAME event (idempotent, not skipped)", () => {
    // Triggers are at-least-once. Re-writing the same observed count is a
    // no-op in effect; refusing would also be safe, but writing keeps the
    // recompute self-healing if the stored count drifted some other way.
    expect(_shouldApplyParticipantCount(T0, T0)).toBe(true);
  });

  it("writes when the event carries no usable timestamp", () => {
    // Degrade to the previous last-write-wins rather than refusing to
    // update at all — a missing context.timestamp must not freeze the
    // counter permanently.
    expect(_shouldApplyParticipantCount(0, T0)).toBe(true);
    expect(_shouldApplyParticipantCount(NaN, T0)).toBe(true);
  });

  it("resolves the documented interleave to the ACTUAL final count", () => {
    // Replay the scenario end to end: whichever trigger observed the later
    // commit is the one whose count survives, regardless of write order.
    const joinObservedAt = T0;
    const leaveObservedAt = LATER;

    // leave writes first (it observed later) — accepted, marker = LATER
    expect(_shouldApplyParticipantCount(leaveObservedAt, 0)).toBe(true);
    // join's write lands afterwards but observed EARLIER — rejected
    expect(_shouldApplyParticipantCount(joinObservedAt, leaveObservedAt)).toBe(
      false
    );
  });
});
