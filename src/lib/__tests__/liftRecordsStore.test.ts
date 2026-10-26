// @vitest-environment jsdom
/**
 * The best-lift map's store, through its own interface and the one
 * Firestore fake (ADR-0009). Its only test used to render the workout
 * screen, tap three sets and save; the delete path, which never learned
 * the protocol, had none. (jsdom: `fetchSavedWorkouts` reads the offline
 * queue from localStorage.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
const owner = vi.hoisted(() => ({ currentUser: { uid: "u1" } }));
vi.mock("@/lib/firebase", () => ({ db: {}, auth: owner }));

import {
  commitLiftRecords,
  invalidateLiftRecords,
  loadLiftRecords,
  markLiftRecordsStale,
} from "../liftRecordsStore";
import { deleteLoggedSession } from "../sessionDelete";
import { fetchSavedWorkouts } from "../savedWorkouts";
import {
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { savedWorkoutDoc } from "@/test/sessionFixtures";
import { writeBatch } from "firebase/firestore";
import type { PRMap } from "../prTracking";

const RECORDS = "users/u1/stats/prMap";

/** A saved bench session: `sets` working sets of weight × reps. */
function bench(
  day: string,
  weightKg: number,
  reps = 5,
  extra: { type?: string; weightKg: number; reps: number }[] = []
) {
  return savedWorkoutDoc(day, {
    exercises: [
      {
        exerciseId: "bench-press",
        exerciseName: "Bench Press",
        category: "chest",
        caloriesBurned: 0,
        sets: [
          ...extra.map((set, i) => ({ setNumber: i + 1, ...set })),
          { setNumber: extra.length + 1, weightKg, reps },
        ],
      },
    ],
  });
}

const benchBest = (records: { map: Record<string, unknown> }) =>
  (records.map["Bench Press"] as Record<string, { weight: number } | null>)?.[
    "5rm"
  ]?.weight;

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
});

describe("loadLiftRecords", () => {
  it("keeps a stored map rather than rebuilding it from the recent window", async () => {
    // The window holds 85, the stored best is 100: a rebuild would let a
    // 90 kg set be celebrated as a best.
    seedFirestore({
      [RECORDS]: {
        map: {
          "Bench Press": {
            "5rm": { weight: 100, reps: 5, date: "2026-01-01" },
          },
        },
        sessionCounts: { "Bench Press": 9 },
        volumeBest: { "Bench Press": { volume: 500, date: "2026-01-01" } },
        revision: 7,
      },
      "users/u1/workouts/w1": bench("2026-06-01", 85),
    });

    const records = await loadLiftRecords(
      "u1",
      await fetchSavedWorkouts("u1", { latest: 50 })
    );

    expect(benchBest(records)).toBe(100);
    expect(records.sessionCounts).toEqual({ "Bench Press": 9 });
    expect(records.revision).toBe(7);
  });

  it("fills in only what a legacy map lacks", async () => {
    seedFirestore({
      [RECORDS]: {
        map: {
          "Bench Press": {
            "5rm": { weight: 100, reps: 5, date: "2026-01-01" },
          },
        },
        revision: 2,
      },
      "users/u1/workouts/w1": bench("2026-06-01", 85),
      "users/u1/workouts/w2": bench("2026-06-03", 87.5),
    });

    const records = await loadLiftRecords(
      "u1",
      await fetchSavedWorkouts("u1", { latest: 50 })
    );

    expect(benchBest(records)).toBe(100);
    expect(records.sessionCounts).toEqual({ "Bench Press": 2 });
    expect(records.volumeBest["Bench Press"]?.volume).toBe(87.5 * 5);
  });

  it("rebuilds a stale map from the whole history, not the window", async () => {
    seedFirestore({
      [RECORDS]: {
        invalidated: true,
        revision: 4,
        map: {
          "Bench Press": {
            "5rm": { weight: 200, reps: 5, date: "2026-01-01" },
          },
        },
        sessionCounts: { "Bench Press": 1 },
        volumeBest: {},
      },
      "users/u1/workouts/old": bench("2025-01-01", 120),
      "users/u1/workouts/new": bench("2026-06-01", 80),
    });

    // A window that misses the old session: only the whole history has 120.
    const records = await loadLiftRecords(
      "u1",
      await fetchSavedWorkouts("u1", { latest: 1 })
    );

    expect(benchBest(records)).toBe(120);
    expect(records.sessionCounts).toEqual({ "Bench Press": 2 });
    expect(records.revision).toBe(4);
  });

  it("rebuilds an old-format workout under its exercise and weight", async () => {
    // G4-51: workouts saved before `exerciseName` and `weightKg` carry
    // `name` and `set.weight`. Rebuilt, they were filed under `undefined`
    // at 0 kg, so a 90 x 5 below a logged 100 x 5 was the best.
    seedFirestore({
      [RECORDS]: { invalidated: true, revision: 2 },
      "users/u1/workouts/legacy": {
        date: "2025-03-01",
        completedAt: "2025-03-01T18:00:00.000Z",
        exercises: [{ name: "Bench Press", sets: [{ weight: 100, reps: 5 }] }],
      },
      "users/u1/workouts/new": bench("2026-06-01", 90),
    });

    const records = await loadLiftRecords(
      "u1",
      await fetchSavedWorkouts("u1", { latest: 1 })
    );

    expect(benchBest(records)).toBe(100);
    expect(Object.keys(records.map)).toEqual(["Bench Press"]);
    expect(records.sessionCounts).toEqual({ "Bench Press": 2 });
  });

  it("does not count warm-up sets as volume when it rebuilds", async () => {
    // The live session leaves warm-ups out of a session's volume, so a
    // rebuilt best that counted them was one no session could beat.
    seedFirestore({
      "users/u1/workouts/w1": bench("2026-06-01", 100, 5, [
        { type: "warmup", weightKg: 60, reps: 10 },
      ]),
    });

    const records = await loadLiftRecords(
      "u1",
      await fetchSavedWorkouts("u1", { latest: 50 })
    );

    expect(records.volumeBest["Bench Press"]?.volume).toBe(500);
  });
});

describe("commitLiftRecords", () => {
  const loaded = {
    sessionCounts: { "Bench Press": 3 },
    volumeBest: { "Bench Press": { volume: 400, date: "2026-05-01" } },
    revision: 5,
  };
  const session: Parameters<typeof commitLiftRecords>[2] = {
    map: {
      "Bench Press": { "5rm": { weight: 90, reps: 5, date: "2026-06-01" } },
    } as unknown as PRMap,
    lifts: [
      { name: "Bench Press", sets: [{ weightKg: 90, reps: 5 }] },
      { name: "Row", sets: [] },
    ],
    date: "2026-06-01",
  };

  it("saves over the revision it loaded", async () => {
    seedFirestore({ [RECORDS]: { revision: 5, map: {} } });

    expect(await commitLiftRecords("u1", loaded, session)).toBe("saved");

    expect(readDoc(RECORDS)).toMatchObject({
      revision: 6,
      invalidated: false,
      map: session.map,
      // An exercise with no working sets done was not trained.
      sessionCounts: { "Bench Press": 4 },
      volumeBest: { "Bench Press": { volume: 450, date: "2026-06-01" } },
    });
  });

  it("marks the map stale instead of writing over a newer one", async () => {
    seedFirestore({ [RECORDS]: { revision: 6, map: { kept: {} } } });

    expect(await commitLiftRecords("u1", loaded, session)).toBe("invalidated");

    expect(readDoc(RECORDS)).toEqual({
      revision: 7,
      invalidated: true,
      map: { kept: {} },
    });
  });
});

describe("a records save that failed", () => {
  it("leaves the map stale, so the next session counts the saved workout", async () => {
    // The map as the failed session found it: complete, so it would be
    // used as it is, and without that session's 130.
    const STORED = {
      revision: 3,
      map: {
        "Bench Press": { "5rm": { weight: 120, reps: 5, date: "2026-01-01" } },
      },
      sessionCounts: { "Bench Press": 1 },
      volumeBest: {},
    };
    seedFirestore({
      [RECORDS]: STORED,
      "users/u1/workouts/old": bench("2026-01-01", 120),
      "users/u1/workouts/failed-records": bench("2026-06-01", 130),
    });
    const window = await fetchSavedWorkouts("u1", { latest: 1 });

    // Anchor: unmarked, the next session takes the stored map as it is.
    expect(benchBest(await loadLiftRecords("u1", window))).toBe(120);

    await markLiftRecordsStale("u1");

    const next = await loadLiftRecords("u1", window);
    expect(benchBest(next)).toBe(130);
    expect(next.sessionCounts).toEqual({ "Bench Press": 2 });
    expect(next.revision).toBe(4);
  });
});

describe("invalidating the map", () => {
  it("stops a session that loaded the old map from writing it back", async () => {
    seedFirestore({ [RECORDS]: { revision: 5, map: {} } });
    const batch = writeBatch({} as never);
    invalidateLiftRecords(batch, "u1");
    await batch.commit();

    expect(readDoc(RECORDS)).toMatchObject({ revision: 6, invalidated: true });
    expect(
      await commitLiftRecords(
        "u1",
        { sessionCounts: {}, volumeBest: {}, revision: 5 },
        { map: {}, lifts: [], date: "2026-06-01" }
      )
    ).toBe("invalidated");
  });

  it("a deleted mis-logged best stops being the best to beat", async () => {
    // A 200 kg "best" from a session logged by mistake. Deleting the
    // session used to leave it standing, so real bests under it never
    // showed.
    seedFirestore({
      [RECORDS]: {
        map: {
          "Bench Press": {
            "5rm": { weight: 200, reps: 5, date: "2026-06-02" },
          },
        },
        sessionCounts: { "Bench Press": 3 },
        volumeBest: { "Bench Press": { volume: 1000, date: "2026-06-02" } },
        revision: 3,
      },
      "users/u1/workouts/real": bench("2026-06-01", 100),
      "users/u1/workouts/mislogged": bench("2026-06-02", 200),
    });

    await deleteLoggedSession({ uid: "u1", kind: "workout", id: "mislogged" });

    const records = await loadLiftRecords(
      "u1",
      await fetchSavedWorkouts("u1", { latest: 50 })
    );
    expect(benchBest(records)).toBe(100);
    expect(records.sessionCounts).toEqual({ "Bench Press": 1 });
    expect(records.volumeBest["Bench Press"]?.volume).toBe(500);
  });

  it("a deleted run leaves the map alone", async () => {
    seedFirestore({
      [RECORDS]: { revision: 3, map: {} },
      "users/u1/runs/r1": { date: "2026-06-01", distance: 5000 },
    });

    await deleteLoggedSession({ uid: "u1", kind: "run", id: "r1" });

    expect(readDoc(RECORDS)).toEqual({ revision: 3, map: {} });
  });
});
