/**
 * getPersonalTrajectory — this week vs the SAME SLICE of last week.
 *
 * The whole point of the module is that slice. Comparing a Tuesday
 * against a full previous week reads as a collapse every Monday, which
 * is the PR-G bug: (200 − 1000)/1000 = −80% for a user who is actually
 * ahead of pace.
 *
 * This suite used to drive six `mockResolvedValueOnce` calls in sequence
 * and assert `getDocs` was called six times. That made the window
 * boundaries FICTION — "last-week-to-date runs" was true by position in
 * the mock queue, not because any date filtering happened. A broken
 * boundary (wrong week start, elapsed offset against the wrong anchor,
 * an inclusive/exclusive slip) could not fail it.
 *
 * Now the runs are seeded at real timestamps and the real
 * `where('completedAt', …)` bounds select them. Last week's 10 km is
 * deliberately SPLIT — 1 km before last Tuesday 14:00, 9 km after — so
 * the to-date window has to actually cut the week to produce the
 * expected numbers. Under the old suite that split didn't exist; the two
 * figures came from two different canned responses.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("firebase/firestore");
vi.mock("../firebase", () => ({ db: {} }));

import { getPersonalTrajectory } from "../personalTrajectory";
import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";
import { Timestamp } from "firebase/firestore";

/** Tuesday 14:00 UTC. Week starts Sunday, so: this week from Sun 26th;
 *  last week Sun 19th → Sun 26th; last-week-to-date Sun 19th → Tue 21st
 *  14:00. */
const NOW = new Date("2026-04-28T14:00:00Z");

/** A run doc as stored — `duration` clears the eligibility floor (30s). */
function run(iso: string, km: number) {
  return {
    completedAt: Timestamp.fromDate(new Date(iso)),
    distance: km * 1000,
    duration: 60,
  };
}

beforeEach(() => {
  resetFirestore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getPersonalTrajectory", () => {
  it("returns zeroes for a user with nothing logged", async () => {
    const result = await getPersonalTrajectory("user1");
    expect(result.thisWeek).toEqual({ km: 0, kg: 0, score: 0 });
    expect(result.lastWeek).toEqual({ km: 0, kg: 0, score: 0 });
    expect(result.lastWeekToDate).toEqual({ km: 0, kg: 0, score: 0 });
  });

  it("compares against lastWeekToDate, not lastWeek (the PR-G bug)", async () => {
    seedFirestore({
      // This week — Monday, 2 km.
      "users/user1/runs/tw": run("2026-04-27T10:00:00Z", 2),
      // Last week, INSIDE the to-date slice (Mon 20th, before Tue 14:00).
      "users/user1/runs/lw_early": run("2026-04-20T10:00:00Z", 1),
      // Last week, AFTER the slice (Thu 23rd) — counts toward the full
      // week only. The to-date window must exclude it.
      "users/user1/runs/lw_late": run("2026-04-23T10:00:00Z", 9),
    });

    const result = await getPersonalTrajectory("user1");

    expect(result.thisWeek.score).toBe(200); // 2 km × 100
    expect(result.lastWeek.score).toBe(1000); // 10 km × 100, full week
    expect(result.lastWeekToDate.score).toBe(100); // 1 km × 100, sliced
    // Pre-PR-G this was (200 − 1000)/1000 = −80%: a misleading collapse
    // shown to a user who is ahead of pace.
    expect(result.deltaPct).toBe(100);
    // The full-week total stays available for TrajectoryCard's baseline row.
    expect(result.lastWeek.km).toBe(10);
  });

  it("excludes a run from just BEFORE last week starts", async () => {
    // Deliberately one hour before the boundary (last week starts Sun
    // 19th 00:00), not comfortably outside it. A seed placed days away
    // tolerates a week-start that is a day off; this one does not — and
    // an off-by-one week anchor is the likeliest way this drifts.
    seedFirestore({
      "users/user1/runs/just_before": run("2026-04-18T23:00:00Z", 42),
      "users/user1/runs/tw": run("2026-04-27T10:00:00Z", 2),
    });

    const result = await getPersonalTrajectory("user1");
    expect(result.thisWeek.km).toBe(2);
    expect(result.lastWeek.km).toBe(0);
    expect(result.lastWeekToDate.km).toBe(0);
  });

  it("returns deltaPct=null when lastWeekToDate is zero (no division)", async () => {
    seedFirestore({
      "users/user1/runs/tw": run("2026-04-27T10:00:00Z", 3),
      // Last week's 5 km all lands AFTER the to-date cut, so the slice is
      // empty while the full week is not.
      "users/user1/runs/lw_late": run("2026-04-23T10:00:00Z", 5),
    });

    const result = await getPersonalTrajectory("user1");

    expect(result.thisWeek.score).toBe(300);
    expect(result.lastWeek.score).toBe(500);
    expect(result.lastWeekToDate.score).toBe(0);
    // Caller renders "new" copy rather than a meaningless −100%.
    expect(result.deltaPct).toBeNull();
  });

  it("ignores a sub-threshold run (eligibility floor)", async () => {
    seedFirestore({
      "users/user1/runs/bogus": {
        completedAt: Timestamp.fromDate(new Date("2026-04-27T10:00:00Z")),
        distance: 40000,
        duration: 8,
      },
    });
    const result = await getPersonalTrajectory("user1");
    expect(result.thisWeek.km).toBe(0);
  });
});
