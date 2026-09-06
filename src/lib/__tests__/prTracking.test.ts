import { setPRDescription, recordSetBest } from "../prTracking";
import { describe, it, expect } from "vitest";
import {
  getRepBucket,
  repBucketLabel,
  buildPRMap,
  checkSetPR,
  buildVolumeBest,
  nextVolumeBest,
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

describe("checkSetPR — honest strength comparisons", () => {
  const history = buildPRMap([
    {
      date: "2025-01-01",
      exercises: [{ exerciseName: "Row", sets: [{ weightKg: 60, reps: 8 }] }],
    },
  ]);
  const counts = { Row: 5 };
  it.each([
    [62.5, 8],
    [60, 9],
  ])("recognises a supported new best: %s × %s", (weight, reps) => {
    expect(checkSetPR("Row", weight, reps, history, counts)).toMatchObject({
      kind: "best",
      weight,
      reps,
      previousBest: { weight: 60, reps: 8 },
    });
  });
  it("names a lighter new range without claiming improved strength", () => {
    const result = checkSetPR("Row", 32.5, 10, history, counts)!;
    expect(result.kind).toBe("bucket-first");
    expect(setPRDescription(result)).toBe(
      "First time at 9+ reps. Your best stays 60 kg × 8."
    );
  });
  it("does not celebrate a weaker improvement within an existing range", () => {
    const map = buildPRMap([
      {
        date: "2025-01-01",
        exercises: [
          {
            exerciseName: "Row",
            sets: [
              { weightKg: 60, reps: 8 },
              { weightKg: 32.5, reps: 10 },
            ],
          },
        ],
      },
    ]);
    expect(checkSetPR("Row", 35, 10, map, counts)).toBeNull();
    expect(
      recordSetBest(map, "Row", { weight: 35, reps: 10, date: "2025-01-02" })
        .Row["10rm"]?.weight
    ).toBe(35);
  });
  it("records stronger estimates even at a lighter weight within the range", () => {
    const map = buildPRMap([
      {
        date: "2025-01-01",
        exercises: [
          {
            exerciseName: "Row",
            sets: [
              { weightKg: 60, reps: 6 },
              { weightKg: 59, reps: 8 },
            ],
          },
        ],
      },
    ]);
    expect(map.Row["8rm"]).toMatchObject({ weight: 59, reps: 8 });
  });
  it("names a first logged set without a fabricated comparison", () => {
    const result = checkSetPR("Row", 60, 8, {}, counts)!;
    expect(result.kind).toBe("bucket-first");
    expect(setPRDescription(result)).toBe("First logged at 60 kg × 8.");
  });
  it.each([
    [60, 8],
    [55, 8],
    [0, 8],
    [70, 0],
    [NaN, 8],
    [70, Infinity],
  ])("rejects matched, lower or invalid sets: %s × %s", (weight, reps) => {
    expect(checkSetPR("Row", weight, reps, history, counts)).toBeNull();
  });
  it("preserves the minimum-session gate", () => {
    expect(checkSetPR("Row", 100, 8, history, { Row: 2 })).toBeNull();
  });
});

/**
 * The rebuild applies the LIVE gate (isSetEligibleForStrengthPr).
 *
 * The live path refuses warm-ups and timed holds before firing or
 * recording a PR — but this rebuild REPLACES the live-built map whenever
 * stats/prMap is missing or legacy, so anything it admits comes back no
 * matter what the live gate refused. Every existing fixture in this file
 * carries sets with NO `type`, and they all assert records ARE created —
 * which doubles as the pin that absent type means working (pre-D2 docs;
 * export.ts's documented default).
 */
describe("buildPRMap applies the live PR gate", () => {
  it("gives a timed hold no entry at all — not even an empty one", () => {
    /* A hold's name does not belong in a rep-bucket map: a 20 kg / 60 s
       weighted plank is not a "10+ Rep Max", and ExerciseHistory already
       titles its records "Longest hold". The exercise-level skip (rather
       than only the per-set predicate) is what keeps the NAME out. */
    const map = buildPRMap([
      {
        date: "2026-08-10",
        exercises: [
          {
            exerciseName: "Weighted Plank",
            repUnit: "seconds",
            sets: [{ weightKg: 20, reps: 60 }],
          },
          { exerciseName: "Bench", sets: [{ weightKg: 100, reps: 5 }] },
        ],
      },
    ]);
    expect("Weighted Plank" in map).toBe(false);
    // Positive anchor: the sweep ran and recorded the real lift.
    expect(map["Bench"]["5rm"]?.weight).toBe(100);
  });

  it("does not let a warm-up seed a record that suppresses a real PR", () => {
    /* The consequence that makes the warm-up half matter: records don't
       just display, they GATE checkSetPR. A historical 60 kg warm-up
       outranking today's 55 kg working set means the working set fires
       nothing — a real PR silently swallowed by preparation work. */
    const map = buildPRMap([
      {
        date: "2026-07-01",
        exercises: [
          {
            exerciseName: "Bench",
            sets: [
              { weightKg: 60, reps: 10, type: "warmup" },
              { weightKg: 100, reps: 5, type: "working" },
            ],
          },
        ],
      },
    ]);
    expect(map["Bench"]["10rm"]).toBeNull();
    expect(map["Bench"]["5rm"]?.weight).toBe(100);
    // ...and the suppressed-PR scenario now fires.
    expect(checkSetPR("Bench", 55, 10, map, { Bench: 5 })).toMatchObject({
      kind: "bucket-first",
      bucket: "10rm",
    });
  });

  it("still records drop sets and failure sets", () => {
    /* The predicate's own docblock draws this line: PR eligibility admits
       a drop set (a legitimate record on its reduced load) and a failure
       set; PROGRESSION eligibility does not. Reaching for the progression
       predicate here would erase real records — the near-miss the
       sessionSetPolicy header warns about, in the other direction. */
    const map = buildPRMap([
      {
        date: "2026-08-10",
        exercises: [
          {
            exerciseName: "Bench",
            sets: [
              { weightKg: 60, reps: 12, type: "dropset" },
              { weightKg: 100, reps: 5, type: "failure" },
            ],
          },
        ],
      },
    ]);
    expect(map["Bench"]["10rm"]?.weight).toBe(60);
    expect(map["Bench"]["5rm"]?.weight).toBe(100);
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

  it("a heavier set with a lower estimate does not replace the best", () => {
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
    expect(map["Bench Press"]["8rm"]?.weight).toBe(100);
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

  it("buildVolumeBest gives a timed hold no volume record at all", () => {
    /* `weighted-plank` is a real catalog exercise: loaded AND measured in
       seconds, so its `reps` is a duration. 20 kg × 60 s is not 1,200 kg
       lifted, and "best volume" is not the axis a hold competes on — the
       app already says so elsewhere (ExerciseHistory headlines "Longest
       hold" and omits Volume from its metric options; the PR gate refuses
       a volume PR for one).

       This map was the last writer that hadn't been told, and unlike the
       others it is PERSISTED, so the figure it invented outlived the
       session that produced it. */
    const best = buildVolumeBest([
      {
        date: "2026-08-10",
        exercises: [
          {
            exerciseName: "Weighted Plank",
            repUnit: "seconds",
            sets: [
              { weightKg: 20, reps: 60 },
              { weightKg: 20, reps: 45 },
            ],
          },
          { exerciseName: "Bench", sets: [{ weightKg: 100, reps: 8 }] },
        ],
      },
    ]);
    expect(best["Weighted Plank"]).toBeUndefined();
    // Anchored on the positive: the sweep ran and scored the real lift,
    // so the absence above is an exclusion rather than an empty map.
    expect(best["Bench"]).toEqual({ volume: 800, date: "2026-08-10" });
  });

  it("buildVolumeBest still scores an exercise explicitly marked as reps", () => {
    /* The type admits `repUnit: "reps"`, so a truthiness check would drop
       ordinary work — an exclusion that over-fires costs what omitting it
       did. */
    const best = buildVolumeBest([
      {
        date: "2026-08-10",
        exercises: [
          {
            exerciseName: "Curl",
            repUnit: "reps",
            sets: [{ weightKg: 30, reps: 12 }],
          },
        ],
      },
    ]);
    expect(best["Curl"]).toEqual({ volume: 360, date: "2026-08-10" });
  });

  describe("nextVolumeBest — what actually gets persisted", () => {
    /* This is the map written to `users/{uid}/stats/prMap.volumeBest`. It
       lived inline in WorkoutSession, a ~1900-line component with no test
       file, so none of the below was reachable. */

    it("keeps the better of the loaded record and this session", () => {
      const current = { Bench: { volume: 1500, date: "2026-07-01" } };
      expect(
        nextVolumeBest(
          current,
          [{ name: "Bench", sets: [{ weightKg: 100, reps: 20 }] }],
          "2026-08-10"
        ).Bench
      ).toEqual({ volume: 2000, date: "2026-08-10" });
      // A worse session leaves the record standing.
      expect(
        nextVolumeBest(
          current,
          [{ name: "Bench", sets: [{ weightKg: 100, reps: 5 }] }],
          "2026-08-10"
        ).Bench
      ).toEqual({ volume: 1500, date: "2026-07-01" });
    });

    it("carries forward exercises this session did not train", () => {
      const current = { Squat: { volume: 3000, date: "2026-07-01" } };
      expect(
        nextVolumeBest(
          current,
          [{ name: "Bench", sets: [{ weightKg: 100, reps: 8 }] }],
          "2026-08-10"
        ).Squat
      ).toEqual({ volume: 3000, date: "2026-07-01" });
    });

    it("records nothing for a timed hold", () => {
      const next = nextVolumeBest(
        {},
        [
          {
            name: "Weighted Plank",
            repUnit: "seconds",
            sets: [{ weightKg: 20, reps: 60 }],
          },
          { name: "Bench", sets: [{ weightKg: 100, reps: 8 }] },
        ],
        "2026-08-10"
      );
      expect(next["Weighted Plank"]).toBeUndefined();
      // Positive anchor: the pass ran and scored the real lift.
      expect(next.Bench).toEqual({ volume: 800, date: "2026-08-10" });
    });

    it("DELETES a stale hold record rather than preserving it", () => {
      /* The behaviour that makes this a repair and not just a stop. The
         map is carried forward by spreading the loaded copy, so a
         weight×seconds figure written before the rule existed would
         otherwise survive every future session untouched. */
      const current = {
        "Weighted Plank": { volume: 1200, date: "2026-07-01" },
        Bench: { volume: 800, date: "2026-07-01" },
      };
      const next = nextVolumeBest(
        current,
        [
          {
            name: "Weighted Plank",
            repUnit: "seconds",
            sets: [{ weightKg: 20, reps: 60 }],
          },
        ],
        "2026-08-10"
      );
      expect("Weighted Plank" in next).toBe(false);
      // Only the hold's entry goes; unrelated records are untouched.
      expect(next.Bench).toEqual({ volume: 800, date: "2026-07-01" });
    });

    it("still records an exercise explicitly marked as reps", () => {
      // The type admits "reps", so a truthiness check would drop real work.
      expect(
        nextVolumeBest(
          {},
          [
            {
              name: "Curl",
              repUnit: "reps",
              sets: [{ weightKg: 30, reps: 12 }],
            },
          ],
          "2026-08-10"
        ).Curl
      ).toEqual({ volume: 360, date: "2026-08-10" });
    });

    it("ignores an unnamed slot without touching the map", () => {
      // `day.exercises[i]?.name ?? ""` at the call site can be empty.
      const current = { Bench: { volume: 800, date: "2026-07-01" } };
      expect(
        nextVolumeBest(
          current,
          [{ name: "", sets: [{ weightKg: 100, reps: 8 }] }],
          "2026-08-10"
        )
      ).toEqual(current);
    });

    it("does not mutate the map it was given", () => {
      const current = { Bench: { volume: 800, date: "2026-07-01" } };
      nextVolumeBest(
        current,
        [
          { name: "Bench", sets: [{ weightKg: 100, reps: 20 }] },
          {
            name: "Weighted Plank",
            repUnit: "seconds",
            sets: [{ weightKg: 20, reps: 60 }],
          },
        ],
        "2026-08-10"
      );
      expect(current).toEqual({ Bench: { volume: 800, date: "2026-07-01" } });
    });
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
    expect(checkSetPR("Bench", 112.5, 1, map, { Bench: 10 })).toMatchObject({
      kind: "best",
      bucket: "1rm",
    });
  });
});
