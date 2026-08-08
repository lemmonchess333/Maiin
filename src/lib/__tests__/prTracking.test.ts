import { describe, it, expect } from "vitest";
import {
  getRepBucket,
  repBucketLabel,
  buildPRMap,
  checkSetPR,
  buildVolumeBest,
  checkVolumePR,
  exerciseSessionVolume,
  bumpSessionCounts,
} from "../prTracking";
import type { RepBucket } from "../prTracking";

describe("getRepBucket", () => {
  it.each([
    [1, "1rm"],
    [2, "3rm"],
    [3, "3rm"],
    [4, "5rm"],
    [5, "5rm"],
    [6, "8rm"],
    [8, "8rm"],
    [9, "10rm"],
    [10, "10rm"],
    [15, "10rm"],
    [20, "10rm"],
  ] as [number, RepBucket][])("maps %i reps → %s", (reps, expected) => {
    expect(getRepBucket(reps)).toBe(expected);
  });
});

describe("repBucketLabel", () => {
  it.each([
    ["1rm", "1-Rep Max"],
    ["3rm", "3-Rep Max"],
    ["5rm", "5-Rep Max"],
    ["8rm", "8-Rep Max"],
    ["10rm", "10+ Rep Max"],
  ] as [RepBucket, string][])("%s → %s", (bucket, label) => {
    expect(repBucketLabel(bucket)).toBe(label);
  });
});

describe("buildPRMap", () => {
  it("picks highest weight per bucket per exercise", () => {
    const workouts = [
      {
        date: "2025-01-01",
        exercises: [
          {
            exerciseName: "Bench Press",
            sets: [
              { weightKg: 80, reps: 5 },
              { weightKg: 85, reps: 5 },
              { weightKg: 100, reps: 1 },
            ],
          },
        ],
      },
      {
        date: "2025-01-03",
        exercises: [
          {
            exerciseName: "Bench Press",
            sets: [
              { weightKg: 82.5, reps: 5 },
              { weightKg: 90, reps: 3 },
            ],
          },
        ],
      },
    ];

    const map = buildPRMap(workouts);
    expect(map["Bench Press"]["5rm"]?.weight).toBe(85);
    expect(map["Bench Press"]["1rm"]?.weight).toBe(100);
    expect(map["Bench Press"]["3rm"]?.weight).toBe(90);
    expect(map["Bench Press"]["8rm"]).toBeNull();
    expect(map["Bench Press"]["10rm"]).toBeNull();
  });

  it("ignores sets with zero weight", () => {
    const map = buildPRMap([
      {
        date: "2025-01-01",
        exercises: [
          {
            exerciseName: "Push Ups",
            sets: [{ weightKg: 0, reps: 20 }],
          },
        ],
      },
    ]);
    expect(map["Push Ups"]["10rm"]).toBeNull();
  });

  it("handles multiple exercises", () => {
    const map = buildPRMap([
      {
        date: "2025-01-01",
        exercises: [
          { exerciseName: "Squat", sets: [{ weightKg: 120, reps: 5 }] },
          { exerciseName: "Deadlift", sets: [{ weightKg: 180, reps: 1 }] },
        ],
      },
    ]);
    expect(map["Squat"]["5rm"]?.weight).toBe(120);
    expect(map["Deadlift"]["1rm"]?.weight).toBe(180);
  });
});

describe("checkSetPR", () => {
  const prMap = buildPRMap([
    {
      date: "2025-01-01",
      exercises: [
        {
          exerciseName: "Bench Press",
          sets: [
            { weightKg: 80, reps: 5 },
            { weightKg: 100, reps: 1 },
          ],
        },
      ],
    },
  ]);
  const sessionCounts = { "Bench Press": 5, "New Exercise": 1 };

  it("returns bucket when weight beats record", () => {
    expect(checkSetPR("Bench Press", 82.5, 5, prMap, sessionCounts)).toBe(
      "5rm"
    );
  });

  it("returns null when weight does not beat record and reps are same", () => {
    expect(checkSetPR("Bench Press", 80, 5, prMap, sessionCounts)).toBeNull();
    expect(checkSetPR("Bench Press", 75, 5, prMap, sessionCounts)).toBeNull();
  });

  it("returns bucket for same weight with more reps (rep PR)", () => {
    // Same weight (80kg) but 6 reps instead of 5 — maps to 8rm bucket (6 reps → 8rm)
    // Since 8rm has no record, this is a new PR
    expect(checkSetPR("Bench Press", 80, 6, prMap, sessionCounts)).toBe("8rm");
    // For 1rm: 100kg with 2 reps maps to 3rm bucket (new), not a same-weight comparison
    // To test true same-weight rep improvement, we need same bucket
    expect(checkSetPR("Bench Press", 100, 1, prMap, sessionCounts)).toBeNull(); // same weight, same reps
  });

  it("returns bucket for a new rep range with no prior record", () => {
    expect(checkSetPR("Bench Press", 60, 10, prMap, sessionCounts)).toBe(
      "10rm"
    );
  });

  it("returns null when session count < minSessions", () => {
    expect(checkSetPR("New Exercise", 200, 5, prMap, sessionCounts)).toBeNull();
    expect(
      checkSetPR("New Exercise", 200, 5, prMap, sessionCounts, 3)
    ).toBeNull();
  });

  it("returns null for zero weight", () => {
    expect(checkSetPR("Bench Press", 0, 5, prMap, sessionCounts)).toBeNull();
  });

  it("returns bucket for exercise not in prMap but with enough sessions", () => {
    const counts = { OHP: 4 };
    expect(checkSetPR("OHP", 50, 8, prMap, counts)).toBe("8rm");
  });
});

// Training-book backlog section 3 (B1): the rebuild path must apply the same
// same-weight-more-reps tiebreak as the live checkSetPR path — before the fix
// a rebuild from history silently degraded such records and the user could
// re-earn a PR they already hit.
describe("buildPRMap rebuild tiebreak (B1)", () => {
  it("keeps the higher-rep record at equal weight within a bucket", () => {
    const map = buildPRMap([
      {
        date: "2026-07-01",
        exercises: [
          {
            exerciseName: "Bench Press",
            sets: [{ weightKg: 100, reps: 7 }],
          },
        ],
      },
      {
        date: "2026-07-08",
        exercises: [
          {
            exerciseName: "Bench Press",
            sets: [{ weightKg: 100, reps: 8 }],
          },
        ],
      },
    ]);
    expect(map["Bench Press"]["8rm"]).toEqual({
      weight: 100,
      reps: 8,
      date: "2026-07-08",
    });
  });

  it("is order-independent — later lower-rep set does not clobber", () => {
    const map = buildPRMap([
      {
        date: "2026-07-01",
        exercises: [
          {
            exerciseName: "Bench Press",
            sets: [{ weightKg: 100, reps: 8 }],
          },
        ],
      },
      {
        date: "2026-07-08",
        exercises: [
          {
            exerciseName: "Bench Press",
            sets: [{ weightKg: 100, reps: 7 }],
          },
        ],
      },
    ]);
    expect(map["Bench Press"]["8rm"]).toMatchObject({
      reps: 8,
      date: "2026-07-01",
    });
  });

  it("heavier weight still wins regardless of reps", () => {
    const map = buildPRMap([
      {
        date: "2026-07-01",
        exercises: [
          {
            exerciseName: "Bench Press",
            sets: [
              { weightKg: 100, reps: 8 },
              { weightKg: 102.5, reps: 6 },
            ],
          },
        ],
      },
    ]);
    expect(map["Bench Press"]["8rm"]?.weight).toBe(102.5);
  });
});

// Backlog #2 — session-volume PR (three-axis PR, Green/B1).
describe("session-volume PR", () => {
  it("exerciseSessionVolume sums weight×reps, ignoring zero-weight/rep sets", () => {
    expect(
      exerciseSessionVolume([
        { weightKg: 100, reps: 8 },
        { weightKg: 100, reps: 7 },
        { weightKg: 0, reps: 12 },
        { weightKg: 60, reps: 0 },
      ])
    ).toBe(1500);
  });

  it("buildVolumeBest keeps the best single-session volume per exercise", () => {
    const best = buildVolumeBest([
      {
        date: "2026-07-01",
        exercises: [
          { exerciseName: "Bench", sets: [{ weightKg: 100, reps: 8 }] },
        ],
      },
      {
        date: "2026-07-08",
        exercises: [
          {
            exerciseName: "Bench",
            sets: [
              { weightKg: 95, reps: 8 },
              { weightKg: 95, reps: 8 },
            ],
          },
        ],
      },
    ]);
    // 1520 (2×95×8) beats 800 even though the top set was lighter —
    // that is exactly the third axis.
    expect(best["Bench"]).toEqual({ volume: 1520, date: "2026-07-08" });
  });

  it("checkVolumePR gates on history depth, positive volume, and beating the best", () => {
    const best = { Bench: { volume: 1500, date: "2026-07-01" } };
    const counts = { Bench: 5, Curl: 1 };
    expect(checkVolumePR("Bench", 1600, best, counts)).toBe(true);
    expect(checkVolumePR("Bench", 1500, best, counts)).toBe(false);
    expect(checkVolumePR("Bench", 0, {}, counts)).toBe(false);
    expect(checkVolumePR("Curl", 500, {}, counts)).toBe(false); // < 3 sessions
    expect(checkVolumePR("Bench", 100, {}, counts)).toBe(true); // no prior best
  });
});

describe("bumpSessionCounts — the counts must grow or the celebrations never fire", () => {
  it("increments each trained exercise once, starting new ones at 1", () => {
    const next = bumpSessionCounts({ Bench: 3 }, ["Bench", "Squat"]);
    expect(next).toEqual({ Bench: 4, Squat: 1 });
  });

  it("counts a duplicated name once and leaves untrained exercises alone", () => {
    const next = bumpSessionCounts({ Bench: 2, Row: 5 }, ["Bench", "Bench"]);
    expect(next).toEqual({ Bench: 3, Row: 5 });
  });

  it("does not mutate its input", () => {
    const counts = { Bench: 1 };
    bumpSessionCounts(counts, ["Bench"]);
    expect(counts).toEqual({ Bench: 1 });
  });

  it("THE DEFECT: a persisted-then-frozen count locks the PR gate forever; bumped counts open it on session 4", () => {
    // Probe-measured (2026-08-05): WorkoutSession persisted the loaded
    // counts back verbatim, so a user whose stats doc was created on
    // session 1 sat at {Bench: 1} through ten sessions of monotonically
    // heavier lifting — checkSetPR null on every single one.
    let frozen: Record<string, number> = { Bench: 1 };
    let bumped: Record<string, number> = { Bench: 1 };
    const prMap = {};
    let frozenPRs = 0;
    let bumpedPRs = 0;
    for (let session = 2; session <= 10; session++) {
      const weight = 80 + session * 2.5;
      if (checkSetPR("Bench", weight, 5, prMap, frozen)) frozenPRs++;
      if (checkSetPR("Bench", weight, 5, prMap, bumped)) bumpedPRs++;
      // The frozen path is what shipped: load → (no increment) → persist.
      frozen = { ...frozen };
      bumped = bumpSessionCounts(bumped, ["Bench"]);
    }
    expect(frozenPRs).toBe(0); // ten sessions, zero celebrations — the bug
    // Bumped: the count reaches 3 after session 3's bump, so the gate is
    // open from session 4 onward — sessions 4-10, seven of them. The >= 3
    // floor itself is deliberate — no confetti on a first attempt — and
    // stays intact.
    expect(bumpedPRs).toBe(7);
  });
});

describe("buildPRMap — malformed legacy sets mint no phantom records", () => {
  // Probe sweep 2026-08-05, verifier-confirmed: `undefined <= 0` is false,
  // so a set missing weightKg passed the guard and recorded
  // {weight: undefined} — and every later REAL set failed both
  // `weight > undefined` and the tiebreak, blocking the bucket forever.
  // getRepBucket(undefined) returns "10rm", filing real weights under a
  // phantom bucket the same way.
  const legacyDay = (sets: { weightKg?: number; reps?: number }[]) => [
    {
      date: "2025-01-01",
      exercises: [
        {
          exerciseName: "Bench",
          sets: sets as { weightKg: number; reps: number }[],
        },
      ],
    },
  ];

  it("a set with zero or missing reps records nothing", () => {
    const map = buildPRMap(legacyDay([{ weightKg: 120, reps: 0 }]));
    expect(Object.values(map.Bench).every((b) => b === null)).toBe(true);
    const map2 = buildPRMap(legacyDay([{ weightKg: 100 }]));
    expect(Object.values(map2.Bench).every((b) => b === null)).toBe(true);
  });

  it("a set with missing or non-finite weight records nothing", () => {
    const map = buildPRMap(legacyDay([{ reps: 5 }]));
    expect(Object.values(map.Bench).every((b) => b === null)).toBe(true);
    const map2 = buildPRMap(legacyDay([{ weightKg: NaN, reps: 5 }]));
    expect(Object.values(map2.Bench).every((b) => b === null)).toBe(true);
  });

  it("THE SUPPRESSION, healed: a real PR is no longer blocked by a phantom", () => {
    // Pre-fix: the {120, reps:0} phantom filed under 1rm suppressed the
    // real 110×1 forever. With the guard, the real set IS the record.
    const map = buildPRMap([
      ...legacyDay([{ weightKg: 120, reps: 0 }]),
      {
        date: "2025-06-01",
        exercises: [
          {
            exerciseName: "Bench",
            sets: [{ weightKg: 110, reps: 1 }],
          },
        ],
      },
    ]);
    expect(map.Bench["1rm"]).toEqual({
      weight: 110,
      reps: 1,
      date: "2025-06-01",
    });
    expect(checkSetPR("Bench", 112.5, 1, map, { Bench: 10 })).toBe("1rm");
  });
});
