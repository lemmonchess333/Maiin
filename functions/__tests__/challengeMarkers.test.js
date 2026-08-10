/**
 * functions/lib/challengeMarkers.js — membership-scoped idempotency keys.
 *
 * Two things are pinned here:
 *   1. The key SEMANTICS — same membership + same source collapses to one
 *      key (so redelivery is a no-op), different membership does not (so a
 *      re-join starts clean), and an unusable `joinedAt` degrades to a
 *      CONSTANT rather than something clock-derived.
 *   2. REACHABILITY (ADR-0008): index.js actually routes both marker sites
 *      through this module. Without that pin this file is the "tested copy"
 *      and index.js the diverging "running copy" — the repo's #1 recurring
 *      mistake, and the reason the challengeBackfill suite pins the same
 *      thing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { membershipKey, markerDocId } from "../lib/challengeMarkers";

const here = dirname(fileURLToPath(import.meta.url));
const INDEX = readFileSync(join(here, "..", "index.js"), "utf8");

/** Stand-in for a Firestore Timestamp — only `toMillis` is consumed. */
const ts = (ms) => ({ toMillis: () => ms });

describe("membershipKey", () => {
  it("reads a Firestore Timestamp, a Date, and raw millis alike", () => {
    // Callers pass `snap.data().joinedAt` without knowing which shape the
    // document holds — Admin SDK gives a Timestamp, but fixtures and the
    // emulator can round-trip a Date.
    expect(membershipKey(ts(1_700_000_000_000))).toBe("m1700000000000");
    expect(membershipKey(new Date(1_700_000_000_000))).toBe("m1700000000000");
    expect(membershipKey(1_700_000_000_000)).toBe("m1700000000000");
  });

  it("collapses every unusable value to the SAME constant", () => {
    // Load-bearing: a fallback that varied per call would make each
    // delivery look new and double-count on every redelivery — strictly
    // worse than the bug this module fixes.
    const bad = [undefined, null, {}, NaN, Infinity, "2026-07-01", ts(NaN)];
    for (const v of bad) {
      expect(membershipKey(v), String(v)).toBe("m0");
    }
  });

  it("is stable across calls for the same input", () => {
    expect(membershipKey(ts(42))).toBe(membershipKey(ts(42)));
    expect(membershipKey(undefined)).toBe(membershipKey(undefined));
  });
});

describe("markerDocId", () => {
  const A = ts(1000);
  const B = ts(2000);

  it("is identical for the same membership and source", () => {
    // This is what keeps an at-least-once trigger redelivery a no-op.
    expect(markerDocId(A, "run-1", "fb")).toBe(markerDocId(A, "run-1", "fb"));
  });

  it("DIFFERS across memberships for the same source", () => {
    // The whole fix. Same source activity, new membership → the backfill
    // sees no marker and credits it, instead of the re-joined user sitting
    // at zero forever.
    expect(markerDocId(A, "run-1", "fb")).not.toBe(
      markerDocId(B, "run-1", "fb")
    );
  });

  it("differs across sources within one membership", () => {
    expect(markerDocId(A, "run-1", "fb")).not.toBe(markerDocId(A, "run-2", "fb"));
  });

  it("uses the fallback only when sourceId is absent, still membership-scoped", () => {
    expect(markerDocId(A, "", "workout_count_legacy_nosrc")).toBe(
      "m1000_workout_count_legacy_nosrc"
    );
    expect(markerDocId(A, undefined, "fb")).toBe("m1000_fb");
    // A missing source degrades to "once per membership per metric" —
    // never to "the guard is off".
    expect(markerDocId(A, undefined, "fb")).not.toBe(
      markerDocId(B, undefined, "fb")
    );
  });

  it("cannot collide with a legacy bare-sourceId marker", () => {
    // Legacy markers are bare `{sourceId}` docs. The `m…_` prefix means a
    // new-scheme key can never accidentally match one — which is what
    // makes the orphans inert rather than still-blocking.
    expect(markerDocId(A, "run-1", "fb")).not.toBe("run-1");
    expect(markerDocId(A, "run-1", "fb").startsWith("m")).toBe(true);
  });
});

describe("reachability — index.js uses this module (ADR-0008)", () => {
  it("requires the module", () => {
    expect(INDEX).toMatch(/require\("\.\/lib\/challengeMarkers"\)/);
  });

  it("routes BOTH applied-marker sites through markerDocId", () => {
    // Two credit paths write markers: the SUM path
    // (applyChallengeProgressIncrement) and the MIN path
    // (syncFastestEffortProgress). Fixing one and not the other leaves
    // fastest_effort stuck at a stale best after a re-join.
    const sites = INDEX.match(/\.collection\("applied"\)/g) || [];
    expect(sites).toHaveLength(2);
    const viaHelper = INDEX.match(/challengeMarkers\.markerDocId\(/g) || [];
    expect(viaHelper).toHaveLength(2);
  });

  it("no longer keys a marker on the bare sourceId", () => {
    // The pre-fix shape: `.collection("applied").doc(sourceId || …)`.
    // Reintroducing it anywhere restores the zeroed-on-rejoin bug.
    expect(INDEX).not.toMatch(
      /\.collection\("applied"\)\s*\n?\s*\.doc\(\s*sourceId/
    );
  });

  it("reads the participant BEFORE building the marker path", () => {
    // The marker path depends on the participant's `joinedAt`, so the two
    // transaction reads must be sequential. A `Promise.all([tx.get(
    // participantRef), tx.get(markerRef)])` cannot express that — its
    // presence would mean the membership scoping had been reverted.
    expect(INDEX).not.toMatch(/Promise\.all\(\[\s*\n?\s*tx\.get\(participantRef\)/);
  });
});
