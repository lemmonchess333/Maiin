import { describe, it, expect } from "vitest";
import {
  weeklyVolumeByMuscle,
  volumeLandmark,
  classifyVolume,
  classifyVolumeDose,
  SECONDARY_SET_WEIGHT,
  balanceWeeklyVolume,
  balancePushPull,
  toCanonical,
} from "../volumeModel";
import type { ProgramExercise, WorkoutDay } from "../programTypes";

function ex(overrides: Partial<ProgramExercise>): ProgramExercise {
  return {
    name: "X",
    exerciseId: "x",
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 8,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...overrides,
  };
}

function day(
  exercises: ProgramExercise[],
  over: Partial<WorkoutDay> = {}
): WorkoutDay {
  return {
    dayName: "D",
    dayType: "upper",
    completed: false,
    exercises,
    ...over,
  };
}

describe("weeklyVolumeByMuscle", () => {
  it("counts primary 1.0 and each secondary 0.5 (fractional volume)", () => {
    // bench-press: Pectorals (primary) + Triceps, Front Delts (secondary)
    const v = weeklyVolumeByMuscle([
      day([ex({ exerciseId: "bench-press", sets: 4 })]),
    ]);
    const get = (m: string) => v.find((x) => x.muscle === m)?.sets;
    expect(get("Chest")).toBe(4); // primary 4 × 1.0
    expect(get("Triceps")).toBe(2); // secondary 4 × 0.5
    expect(get("Shoulders")).toBe(2); // Front Delts → Shoulders, 4 × 0.5
  });

  it("sums across days and exercises", () => {
    const v = weeklyVolumeByMuscle([
      day([ex({ exerciseId: "bench-press", sets: 3 })]),
      day([ex({ exerciseId: "bench-press", sets: 3 })]),
    ]);
    expect(v.find((x) => x.muscle === "Chest")?.sets).toBe(6);
  });

  it("excludes skipped days (no stimulus)", () => {
    const v = weeklyVolumeByMuscle([
      day([ex({ exerciseId: "bench-press", sets: 4 })], { skipped: true }),
    ]);
    expect(v).toEqual([]);
  });

  it("ignores zero-set and non-positive entries", () => {
    const v = weeklyVolumeByMuscle([
      day([ex({ exerciseId: "bench-press", sets: 0 })]),
    ]);
    expect(v).toEqual([]);
  });

  it("falls back to movement category for custom (non-DB) exercises", () => {
    const v = weeklyVolumeByMuscle([
      day([
        ex({
          exerciseId: "my-custom-lift",
          movementCategory: "knee_dominant",
          sets: 5,
        }),
      ]),
    ]);
    expect(v.find((x) => x.muscle === "Quads")?.sets).toBe(5);
  });

  it("returns muscles in canonical display order", () => {
    const v = weeklyVolumeByMuscle([
      day([
        ex({ exerciseId: "bench-press", sets: 3 }), // Chest, Triceps, Shoulders
      ]),
    ]);
    const order = v.map((x) => x.muscle);
    // Chest before Shoulders before Triceps per CANONICAL_MUSCLE_ORDER
    expect(order.indexOf("Chest")).toBeLessThan(order.indexOf("Shoulders"));
    expect(order.indexOf("Shoulders")).toBeLessThan(order.indexOf("Triceps"));
  });
});

describe("balanceWeeklyVolume (D-LIFT-1 active)", () => {
  const hyper = volumeLandmark("hypertrophy"); // low 12, high 20

  it("grows an under-dosed muscle's accessory toward the landmark (capped)", () => {
    const out = balanceWeeklyVolume(
      [
        day([
          // main back row — untouched
          ex({
            exerciseId: "custom-row",
            movementCategory: "horizontal_pull",
            sets: 4,
            isAccessory: false,
          }),
          // biceps accessory, badly under-dosed (2 sets vs low 12)
          ex({
            exerciseId: "custom-curl",
            movementCategory: "arms_biceps",
            sets: 2,
            isAccessory: true,
          }),
        ]),
      ],
      hyper
    );
    const exs = out[0].exercises;
    expect(exs[0].sets).toBe(4); // main untouched
    expect(exs[1].sets).toBe(5); // accessory grown 2 → ACCESSORY_SET_CAP (5)
  });

  it("never touches main lifts", () => {
    const out = balanceWeeklyVolume(
      [
        day([
          ex({
            exerciseId: "custom-curl",
            movementCategory: "arms_biceps",
            sets: 3,
            isAccessory: false, // a MAIN biceps lift
          }),
        ]),
      ],
      hyper
    );
    expect(out[0].exercises[0].sets).toBe(3); // unchanged despite under-dosed
  });

  it("leaves legacy exercises (no isAccessory flag) unchanged", () => {
    const out = balanceWeeklyVolume(
      [
        day([
          ex({
            exerciseId: "custom-curl",
            movementCategory: "arms_biceps",
            sets: 2,
            // isAccessory undefined (legacy)
          }),
        ]),
      ],
      hyper
    );
    expect(out[0].exercises[0].sets).toBe(2);
  });

  it("does not grow a muscle already at/above the landmark low", () => {
    const out = balanceWeeklyVolume(
      [
        day([
          ex({
            exerciseId: "custom-curl",
            movementCategory: "arms_biceps",
            sets: 13, // already ≥ low (12)
            isAccessory: true,
          }),
        ]),
      ],
      hyper
    );
    expect(out[0].exercises[0].sets).toBe(13); // add-only; nothing to do
  });

  it("declines an add whose cost lands on a muscle already at its ceiling", () => {
    // The balancers were add-only with no ceiling at all, so chasing one
    // under-dosed muscle up to MEV freely pushed the muscles that SHARE the
    // exercise past MRV — a 2026-07-28 audit measured generated weeks
    // violating both landmarks at once (Back = 39 against a high of 20 while
    // hamstrings sat at 11 against a low of 12).
    //
    // A hip thrust is Glutes-primary with Hamstrings secondary (0.5/set), so
    // topping up under-dosed glutes also spends hamstring volume — and here
    // the hamstrings are already at the ceiling.
    const atCeiling = () =>
      ex({
        exerciseId: "seated-leg-curl", // Hamstrings 1.0/set
        movementCategory: "hip_dominant",
        sets: 19, // with the hip thrust's 0.5/set this puts Hamstrings AT 20
        isAccessory: false, // a main, so the balancer can't grow it
      });
    const out = balanceWeeklyVolume(
      [
        day([
          ex({
            exerciseId: "hip-thrust",
            movementCategory: "hip_dominant",
            sets: 2, // Glutes = 2, far under the low of 12
            isAccessory: true,
          }),
          atCeiling(),
        ]),
      ],
      hyper
    );
    expect(out[0].exercises[0].sets).toBe(2); // add declined
  });

  it("still grows when the cost lands somewhere with room", () => {
    // The guard must not become a blanket freeze — the identical shape with
    // the hamstrings nowhere near their ceiling still gets the glute top-up.
    const out = balanceWeeklyVolume(
      [
        day([
          ex({
            exerciseId: "hip-thrust",
            movementCategory: "hip_dominant",
            sets: 2,
            isAccessory: true,
          }),
          ex({
            exerciseId: "seated-leg-curl",
            movementCategory: "hip_dominant",
            sets: 4,
            isAccessory: false,
          }),
        ]),
      ],
      hyper
    );
    expect(out[0].exercises[0].sets).toBeGreaterThan(2);
  });

  it("does not mutate the input workouts", () => {
    const input = [
      day([
        ex({
          exerciseId: "custom-curl",
          movementCategory: "arms_biceps",
          sets: 2,
          isAccessory: true,
        }),
      ]),
    ];
    balanceWeeklyVolume(input, hyper);
    expect(input[0].exercises[0].sets).toBe(2); // original untouched
  });
});

describe("balancePushPull (D-LIFT-3)", () => {
  it("grows pull accessories until pull ≥ push when push-dominant", () => {
    const out = balancePushPull([
      day([
        // push: bench main 5 + triceps accessory 3 = 8 push
        ex({
          movementCategory: "horizontal_push",
          sets: 5,
          isAccessory: false,
        }),
        ex({ movementCategory: "arms_triceps", sets: 3, isAccessory: true }),
        // pull: row main 4 = 4 pull (under push)
        ex({
          movementCategory: "horizontal_pull",
          sets: 4,
          isAccessory: false,
        }),
        // pull accessory to grow
        ex({ movementCategory: "arms_biceps", sets: 2, isAccessory: true }),
      ]),
    ]);
    const sets = (cat: string) =>
      out[0].exercises
        .filter((e) => e.movementCategory === cat)
        .reduce((s, e) => s + e.sets, 0);
    const push = sets("horizontal_push") + sets("arms_triceps");
    const pull = sets("horizontal_pull") + sets("arms_biceps");
    expect(pull).toBeGreaterThanOrEqual(push);
    // mains untouched
    expect(
      out[0].exercises.find(
        (e) => e.movementCategory === "horizontal_pull" && !e.isAccessory
      )?.sets
    ).toBe(4);
  });

  it("does nothing when pull already ≥ push", () => {
    const input = [
      day([
        ex({
          movementCategory: "horizontal_push",
          sets: 3,
          isAccessory: false,
        }),
        ex({ movementCategory: "horizontal_pull", sets: 4, isAccessory: true }),
      ]),
    ];
    const out = balancePushPull(input);
    expect(out[0].exercises[1].sets).toBe(4); // untouched
  });

  it("never touches main lifts (only pull accessories grow)", () => {
    const out = balancePushPull([
      day([
        ex({
          movementCategory: "horizontal_push",
          sets: 8,
          isAccessory: false,
        }),
        // only pull is a MAIN — cannot grow it
        ex({
          movementCategory: "horizontal_pull",
          sets: 3,
          isAccessory: false,
        }),
      ]),
    ]);
    expect(out[0].exercises[1].sets).toBe(3); // main pull unchanged despite imbalance
  });

  it("does not mutate the input", () => {
    const input = [
      day([
        ex({
          movementCategory: "horizontal_push",
          sets: 6,
          isAccessory: false,
        }),
        ex({ movementCategory: "arms_biceps", sets: 2, isAccessory: true }),
      ]),
    ];
    balancePushPull(input);
    expect(input[0].exercises[1].sets).toBe(2);
  });
});

describe("volumeLandmark + classifyVolume", () => {
  it("hypertrophy carries the highest target band", () => {
    expect(volumeLandmark("hypertrophy")).toEqual({ mv: 5, low: 12, high: 20 });
    expect(volumeLandmark("strength")).toEqual({ mv: 4, low: 8, high: 14 });
  });

  it("classifies under / optimal / high against the band", () => {
    const lm = volumeLandmark("hypertrophy"); // 12..20
    expect(classifyVolume(8, lm)).toBe("low");
    expect(classifyVolume(14, lm)).toBe("optimal");
    expect(classifyVolume(24, lm)).toBe("high");
    expect(classifyVolume(12, lm)).toBe("optimal"); // inclusive low
    expect(classifyVolume(20, lm)).toBe("optimal"); // inclusive high
  });
});

/* ─── 13a · maintenance volume and the four-band ladder ──────────────────
   MV was missing, and its absence made "redistribute volume" unimplementable:
   specialisation drops non-target muscles to MV, not to MEV, and the band
   between the two is the one RP calls out as pure cost — "more fatigue than
   four sets by a long shot, but no additional benefit" (Ch8 P30 / Ch7 P159).

   Nothing consumes the four-band ladder for a prescription yet. What it must
   not do is move the three-band view underneath the surfaces that DO read it,
   which is what the fold-back assertions below are for. ── */
describe("volume currency (13a, ADR-0010)", () => {
  it("the constant is the thing that actually runs, not documentation", () => {
    // A named constant nothing reads is worse than a literal: it reads as a
    // seam that exists. bench-press is Pectorals primary + Triceps and Front
    // Delts secondary, so one set books exactly one SECONDARY_SET_WEIGHT of
    // triceps — if the tally still had 0.5 hard-coded, this would not track.
    const v = weeklyVolumeByMuscle([
      day([ex({ exerciseId: "bench-press", sets: 4 })]),
    ]);
    expect(v.find((x) => x.muscle === "Triceps")?.sets).toBe(
      4 * SECONDARY_SET_WEIGHT
    );
    expect(v.find((x) => x.muscle === "Chest")?.sets).toBe(4); // primary is always 1.0
  });

  it("is still 0.5 — the flip is staged, and staged on a condition", () => {
    // ADR-0010: 1:1 is the correct currency and the bands assume it, but
    // flipping before the day builders consult the landmarks doubles the
    // per-muscle readings over a ceiling (180/825 -> 364/825 across the
    // 90-config sweep). When the builders become landmark-aware, flip this AND
    // re-baseline D-VOL's ratchet in planSweep.golden.test.ts in the same
    // commit — those bounds are denominated in this currency.
    expect(SECONDARY_SET_WEIGHT).toBe(0.5);
  });
});

describe("maintenance volume (13a)", () => {
  it("MV sits at 0.40–0.50 of MEV, the only ratio the sources support", () => {
    // Two worked pairs in the corpus, no table: back MEV 10 / MV 4 (Ch7 P155)
    // and MV/MEV/MRV 2/4/7 (Ch7 P147-149). Anything outside that range is an
    // invented number and should have to argue with this test.
    for (const goal of [
      "hypertrophy",
      "strength",
      "fat_loss",
      "running",
      "general",
      undefined,
    ]) {
      const lm = volumeLandmark(goal);
      const ratio = lm.mv / lm.low;
      expect(
        ratio,
        `${goal}: MV ${lm.mv} / MEV ${lm.low}`
      ).toBeGreaterThanOrEqual(0.4);
      expect(ratio, `${goal}: MV ${lm.mv} / MEV ${lm.low}`).toBeLessThanOrEqual(
        0.5
      );
      // …and the ladder is ordered, so no band can be empty or inverted.
      expect(lm.mv, `${goal}`).toBeLessThan(lm.low);
      expect(lm.low, `${goal}`).toBeLessThan(lm.high);
    }
  });

  it("separates 'losing the muscle' from 'paying for nothing'", () => {
    const lm = volumeLandmark("hypertrophy"); // mv 5, 12..20
    expect(classifyVolumeDose(3, lm)).toBe("below_maintenance");
    expect(classifyVolumeDose(5, lm)).toBe("junk"); // MV itself: the parking spot
    expect(classifyVolumeDose(11.5, lm)).toBe("junk");
    expect(classifyVolumeDose(12, lm)).toBe("optimal");
    expect(classifyVolumeDose(20, lm)).toBe("optimal");
    expect(classifyVolumeDose(20.5, lm)).toBe("high");
  });

  it("the three-band view every surface reads is unchanged by MV", () => {
    // The whole safety property of 13a: WeeklyVolumeCard and the balancers see
    // exactly what they saw before. Both sub-MEV bands fold back to `low`.
    const lm = volumeLandmark("hypertrophy");
    for (let sets = 0; sets <= 30; sets += 0.5) {
      const expected =
        sets < lm.low ? "low" : sets > lm.high ? "high" : "optimal";
      expect(classifyVolume(sets, lm), `${sets} sets`).toBe(expected);
    }
  });
});

/* ─── P1 · muscle attribution, as DECISIONS rather than accidents ────────
   Each of these was a defect measured by the audit in
   docs/proposals/lifting-v8-evaluation.md §2.4 and pinned by the golden
   sweep before being changed. They are asserted here so a future edit has
   to argue with the reasoning rather than silently revert it. ── */
describe("muscle attribution (P1)", () => {
  it("adductors are hip adductors, not quadriceps", () => {
    // Was "Quads", so a Hip Adduction Machine booked quad volume. Adductor
    // magnus is a primary hip extensor, trained alongside the glutes.
    expect(toCanonical("adductors")).toBe("Glutes");
  });

  it("hip flexors do not book quad volume off every ab movement", () => {
    // Was "Quads". "hip flexors" is a SECONDARY on nearly every ab movement
    // in the DB — crunches, sit-ups, leg raises, russian twists, dead bugs,
    // dragon flags, L-sits — so core sessions silently fed the quad tally.
    expect(toCanonical("hip flexors")).toBeNull();
  });

  it("the trailing-space hip-flexors key is gone, and trimming still works", () => {
    // `"hip flexors "` was an unreachable key (toCanonical trims first) that
    // mapped to a DIFFERENT value than the live one — a contradiction
    // TypeScript could not catch, because the two keys differ.
    expect(toCanonical("  Hip Flexors  ")).toBe(toCanonical("hip flexors"));
  });

  it("forearms earn nothing, deliberately", () => {
    // Not an oversight: there is no Forearms group in this ten-group
    // taxonomy, and no exercise has forearms as its PRIMARY. Mapping them
    // into Biceps would move every biceps tally to avoid a rounding error.
    // Revisit in the taxonomy split (13a).
    expect(toCanonical("forearms")).toBeNull();
    expect(toCanonical("brachioradialis")).toBeNull();
  });

  it("a Full Body lift books its secondaries instead of nothing", () => {
    // An unattributable PRIMARY used to `continue` past the whole lift, so
    // the thirteen "Full Body" movements — Zercher squat, thrusters,
    // kettlebell swing, Turkish get-up — trained nothing as far as the model
    // was concerned, despite naming real muscles as secondaries.
    const week = [day([ex({ exerciseId: "zercher-squat", sets: 4 })])];
    const tally = weeklyVolumeByMuscle(week);
    const quads = tally.find((t) => t.muscle === "Quads");
    expect(quads?.sets).toBe(2); // 4 sets × 0.5 secondary credit
    expect(tally.find((t) => t.muscle === "Glutes")?.sets).toBe(2);
  });

  it("cardio still books nothing, whatever its secondaries claim", () => {
    // The counter-case to the rule above: a treadmill lists Quads/Calves as
    // secondaries and must NOT contribute resistance volume.
    const week = [day([ex({ exerciseId: "treadmill", sets: 3 })])];
    expect(weeklyVolumeByMuscle(week)).toEqual([]);
  });
});
