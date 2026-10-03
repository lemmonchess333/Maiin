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
import { savedRunDoc, savedWorkoutDoc } from "@/test/sessionFixtures";
import { localDateString } from "../dateHelpers";

/** Tuesday 14:00 local time. Week starts Monday, so: this week from Mon 27th;
 *  last week Mon 20th → Mon 27th; last-week-to-date Mon 20th → Tue 21st
 *  14:00. */
const NOW = new Date("2026-04-28T14:00:00");

/** A run doc as stored, finished at `iso` and started that day unless
 *  `startedOn` says otherwise. `duration` clears the eligibility floor
 *  (30s). */
function run(iso: string, km: number, startedOn?: string) {
  const finished = new Date(iso);
  return savedRunDoc(
    startedOn ?? localDateString(finished),
    { distance: km * 1000, duration: 60 },
    finished
  );
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
      "users/user1/runs/tw": run("2026-04-27T10:00:00", 2),
      // Last week, INSIDE the to-date slice (Mon 20th, before Tue 14:00).
      "users/user1/runs/lw_early": run("2026-04-20T10:00:00", 1),
      // Last week, AFTER the slice (Thu 23rd) — counts toward the full
      // week only. The to-date window must exclude it.
      "users/user1/runs/lw_late": run("2026-04-23T10:00:00", 9),
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
    // Deliberately one hour before the boundary (last week starts Mon
    // 20th 00:00), not comfortably outside it. A seed placed days away
    // tolerates a week-start that is a day off; this one does not — and
    // an off-by-one week anchor is the likeliest way this drifts.
    seedFirestore({
      "users/user1/runs/just_before": run("2026-04-19T23:00:00", 42),
      "users/user1/runs/tw": run("2026-04-27T10:00:00", 2),
    });

    const result = await getPersonalTrajectory("user1");
    expect(result.thisWeek.km).toBe(2);
    expect(result.lastWeek.km).toBe(0);
    expect(result.lastWeekToDate.km).toBe(0);
  });

  it("includes the exact local Monday boundary in last week", async () => {
    seedFirestore({
      "users/user1/runs/boundary": run("2026-04-20T00:00:00", 4),
    });
    const result = await getPersonalTrajectory("user1");
    expect(result.lastWeek.km).toBe(4);
    expect(result.lastWeekToDate.km).toBe(4);
    expect(result.thisWeek.km).toBe(0);
  });

  it("returns deltaPct=null when lastWeekToDate is zero (no division)", async () => {
    seedFirestore({
      "users/user1/runs/tw": run("2026-04-27T10:00:00", 3),
      // Last week's 5 km all lands AFTER the to-date cut, so the slice is
      // empty while the full week is not.
      "users/user1/runs/lw_late": run("2026-04-23T10:00:00", 5),
    });

    const result = await getPersonalTrajectory("user1");

    expect(result.thisWeek.score).toBe(300);
    expect(result.lastWeek.score).toBe(500);
    expect(result.lastWeekToDate.score).toBe(0);
    // Caller renders "new" copy rather than a meaningless −100%.
    expect(result.deltaPct).toBeNull();
  });

  it("cuts last week's Tuesday at the same time of day", async () => {
    // Now is Tuesday 14:00. Last Tuesday's 13:00 run is inside the slice;
    // its 15:00 run is after the same point and counts for the full week
    // only.
    seedFirestore({
      "users/user1/runs/before": run("2026-04-21T13:00:00", 3),
      "users/user1/runs/after": run("2026-04-21T15:00:00", 7),
    });
    const result = await getPersonalTrajectory("user1");
    expect(result.lastWeekToDate.km).toBe(3);
    expect(result.lastWeek.km).toBe(10);
  });

  it("puts a run that crossed midnight into the week it started (Lift3)", async () => {
    // Begun on last week's Sunday night, saved at 00:20 on this Monday.
    seedFirestore({
      "users/user1/runs/late": run("2026-04-27T00:20:00", 6, "2026-04-26"),
    });
    const result = await getPersonalTrajectory("user1");
    expect(result.lastWeek.km).toBe(6);
    expect(result.thisWeek.km).toBe(0);
  });

  it("ignores a sub-threshold run (eligibility floor)", async () => {
    seedFirestore({
      "users/user1/runs/bogus": savedRunDoc(
        "2026-04-27",
        { distance: 40000, duration: 8 },
        new Date("2026-04-27T10:00:00")
      ),
    });
    const result = await getPersonalTrajectory("user1");
    expect(result.thisWeek.km).toBe(0);
  });

  it("cuts last week's workouts at the same time of day too", async () => {
    // 80 kg x 5 x 2 sets = 800 kg, 80 points, per seeded workout. Now is
    // Tuesday 14:00: last Tuesday's 09:00 session is inside the slice, its
    // 19:00 session is not. The workouts read used to stop at last
    // Tuesday's date, so the morning session never counted either.
    seedFirestore({
      "users/user1/workouts/morning": savedWorkoutDoc(
        "2026-04-21",
        {},
        new Date("2026-04-21T09:00:00")
      ),
      "users/user1/workouts/evening": savedWorkoutDoc(
        "2026-04-21",
        {},
        new Date("2026-04-21T19:00:00")
      ),
    });
    const result = await getPersonalTrajectory("user1");
    expect(result.lastWeekToDate.kg).toBe(800);
    expect(result.lastWeek.kg).toBe(1600);
  });

  it("counts a timed hold as no weight lifted", async () => {
    // A 100 kg x 5 set (500 kg) and a 20 kg plank held for 60 s, which
    // the old sum counted as 1,200 kg.
    seedFirestore({
      "users/user1/workouts/plank": savedWorkoutDoc("2026-04-27", {
        exercises: [
          {
            exerciseId: "bench-press",
            exerciseName: "Bench Press",
            category: "chest",
            sets: [{ setNumber: 1, reps: 5, weightKg: 100 }],
            caloriesBurned: 0,
          },
          {
            exerciseId: "weighted-plank",
            exerciseName: "Weighted Plank",
            category: "core",
            repUnit: "seconds",
            sets: [{ setNumber: 1, reps: 60, weightKg: 20 }],
            caloriesBurned: 0,
          },
        ],
      }),
    });
    const result = await getPersonalTrajectory("user1");
    expect(result.thisWeek.kg).toBe(500);
  });
});
