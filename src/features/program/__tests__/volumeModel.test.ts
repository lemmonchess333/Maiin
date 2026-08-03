import { describe, it, expect } from "vitest";
import {
  weeklyVolumeByMuscle,
  weeklyVolumeByJudgementMuscle,
  volumeLandmark,
  judgementLandmark,
  classifyVolume,
  classifyVolumeDose,
  SECONDARY_SET_WEIGHT,
  balanceWeeklyVolume,
  balancePushPull,
  reconcileToLandmarks,
  primaryJudgementForExercise,
  toCanonical,
} from "../volumeModel";
import { generateProgram } from "../programEngine";
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
  it("counts primary 1.0 and each secondary 1.0 (the literature's 1:1)", () => {
    // bench-press: Pectorals (primary) + Triceps, Front Delts (secondary).
    // 1:1 since the taxonomy split (ADR-0010's flip): the meta-analyses the
    // bands come from counted indirect sets undiscounted.
    const v = weeklyVolumeByMuscle([
      day([ex({ exerciseId: "bench-press", sets: 4 })]),
    ]);
    const get = (m: string) => v.find((x) => x.muscle === m)?.sets;
    expect(get("Chest")).toBe(4); // primary 4 × 1.0
    expect(get("Triceps")).toBe(4); // secondary 4 × 1.0
    expect(get("Shoulders")).toBe(4); // Front Delts → Shoulders, 4 × 1.0
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
    // A hip thrust is Glutes-primary with Hamstrings secondary (1.0/set at
    // 1:1), so topping up under-dosed glutes also spends hamstring volume —
    // and here the hamstrings are already past the ceiling.
    const atCeiling = () =>
      ex({
        exerciseId: "seated-leg-curl", // Hamstrings 1.0/set
        movementCategory: "hip_dominant",
        sets: 19, // with the hip thrust's 1.0/set this puts Hamstrings over 20
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

  it("is 1.0 — the flip landed with the judgement layer, as ADR-0010 staged", () => {
    // The condition was landmark-aware generation. The reconciler alone was
    // measured insufficient (canonical Shoulders/Core mispriced 1:1 credit);
    // per-group judgement bands closed that, and the flip landed with them.
    // D-VOL's ratchet is denominated in the judged 1:1 unit — flipping this
    // back re-inflates nothing silently: the currency tests above fail.
    expect(SECONDARY_SET_WEIGHT).toBe(1.0);
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
    expect(quads?.sets).toBe(4); // 4 sets × 1.0 secondary credit (1:1)
    expect(tally.find((t) => t.muscle === "Glutes")?.sets).toBe(4);
  });

  it("cardio still books nothing, whatever its secondaries claim", () => {
    // The counter-case to the rule above: a treadmill lists Quads/Calves as
    // secondaries and must NOT contribute resistance volume.
    const week = [day([ex({ exerciseId: "treadmill", sets: 3 })])];
    expect(weeklyVolumeByMuscle(week)).toEqual([]);
  });
});

// ── Intra-exercise canonical dedupe + landmark reconciliation (ADR-0010
//    status addendum, 2026-08-03) ──────────────────────────────────────

describe("canonical tally counts a set once per muscle (intra-exercise dedupe)", () => {
  it("a barbell row books 1.0 Back sets per set, not 1.5", () => {
    // Lats (primary) and Lower Back (secondary) both roll up to canonical
    // Back. Summing fine credits booked 1 + 0.5 per physical set — the
    // shape that drove Back to 37-46 weekly "sets" at 5-6 days. The
    // literature counts a row as ONE set for the back.
    const week = [day([ex({ exerciseId: "barbell-row", sets: 4 })])];
    const back = weeklyVolumeByMuscle(week).find((t) => t.muscle === "Back");
    expect(back?.sets).toBe(4);
  });

  it("cross-muscle secondaries still earn their weight (bench → triceps)", () => {
    // The dedupe is per-CANONICAL-bucket only; ordinary secondary credit
    // into a DIFFERENT muscle is untouched.
    const week = [day([ex({ exerciseId: "bench-press", sets: 4 })])];
    const tally = weeklyVolumeByMuscle(week);
    expect(tally.find((t) => t.muscle === "Chest")?.sets).toBe(4);
    expect(tally.find((t) => t.muscle === "Triceps")?.sets).toBe(
      4 * SECONDARY_SET_WEIGHT
    );
  });
});

describe("reconcileToLandmarks", () => {
  const lm = { mv: 4, low: 8, high: 14 }; // strength band — literal, not derived

  it("shrinks an over-authored week down to the ceiling", () => {
    // 3 bench slots × 6 sets = 18 Chest sets vs high 14 — cut to ≤14.
    const week = [
      day([
        ex({ exerciseId: "bench-press", sets: 6, instanceId: "a" }),
        ex({ exerciseId: "incline-bench", sets: 6, instanceId: "b" }),
        ex({
          exerciseId: "cable-fly",
          sets: 6,
          instanceId: "c",
          isAccessory: true,
        }),
      ]),
    ];
    const out = reconcileToLandmarks(week, lm);
    const chest = weeklyVolumeByMuscle(out).find((t) => t.muscle === "Chest");
    expect(chest?.sets).toBeLessThanOrEqual(14);
    // Shrink-only, structure preserved: same slots, same order, same ids.
    expect(out[0].exercises.map((e) => e.exerciseId)).toEqual([
      "bench-press",
      "incline-bench",
      "cable-fly",
    ]);
    // …and the ORDER of cuts is pinned: 4 sets must come off, the accessory
    // absorbs all of them down to its floor, the mains are untouched.
    expect(out[0].exercises.map((e) => e.sets)).toEqual([6, 6, 2]);
  });

  it("cuts accessories before mains, and respects both floors", () => {
    // Massive overage that floors everything: accessory must land on 2,
    // mains on 3 — never below.
    const week = [
      day([
        ex({ exerciseId: "bench-press", sets: 8, instanceId: "a" }),
        ex({ exerciseId: "incline-bench", sets: 8, instanceId: "b" }),
        ex({
          exerciseId: "cable-fly",
          sets: 8,
          instanceId: "c",
          isAccessory: true,
        }),
      ]),
    ];
    const out = reconcileToLandmarks(week, { mv: 2, low: 4, high: 6 });
    const [main1, main2, acc] = out[0].exercises;
    expect(acc.sets).toBe(2); // accessory floor
    expect(main1.sets).toBe(3); // main floor
    expect(main2.sets).toBe(3);
  });

  it("leaves an in-band week byte-identical in shape", () => {
    const week = [
      day([ex({ exerciseId: "bench-press", sets: 4, instanceId: "a" })]),
    ];
    const out = reconcileToLandmarks(week, lm);
    expect(out[0].exercises[0].sets).toBe(4);
  });

  it("never cuts a slot on a skipped day (the tally doesn't count it)", () => {
    const week = [
      day([ex({ exerciseId: "bench-press", sets: 6, instanceId: "a" })], {
        skipped: true,
      }),
      day([ex({ exerciseId: "incline-bench", sets: 6, instanceId: "b" })]),
    ];
    const out = reconcileToLandmarks(week, { mv: 2, low: 4, high: 5 });
    expect(out[0].exercises[0].sets).toBe(6); // skipped day untouched
    expect(out[1].exercises[0].sets).toBe(5); // active day carries the cut
  });

  it("is deterministic", () => {
    const week = [
      day([
        ex({ exerciseId: "bench-press", sets: 6, instanceId: "a" }),
        ex({ exerciseId: "incline-bench", sets: 6, instanceId: "b" }),
      ]),
    ];
    expect(reconcileToLandmarks(week, lm)).toEqual(
      reconcileToLandmarks(week, lm)
    );
  });
});

describe("generateProgram honours the ceilings (reconciler wiring)", () => {
  it("any JUDGEMENT group still over its ceiling has every primary slot at floor", () => {
    // The reconciler's contract, in the unit it actually enforces: overage
    // may remain ONLY where the builders cannot reach it (all primary slots
    // floor-bound). A single over-ceiling group with a cuttable primary slot
    // means the pass isn't wired in.
    for (const goal of ["hypertrophy", "strength"] as const) {
      for (const days of [4, 5, 6]) {
        const { workouts } = generateProgram("recomp", days, undefined, goal);
        for (const mv of weeklyVolumeByJudgementMuscle(workouts)) {
          const lm2 = judgementLandmark(goal, mv.muscle);
          if (mv.sets <= lm2.high) continue;
          const cuttable = workouts
            .flatMap((d) => d.exercises)
            .filter(
              (e) =>
                primaryJudgementForExercise(e) === mv.muscle &&
                (e.sets ?? 0) > (e.isAccessory === true ? 2 : 3)
            );
          expect(
            cuttable.map((c) => `${c.exerciseId}×${c.sets}`),
            `${goal}/${days}d ${mv.muscle}=${mv.sets} over ${lm2.high} with cuttable slots`
          ).toEqual([]);
        }
      }
    }
  });
});

// ── Judgement layer (taxonomy split — ADR-0010 second addendum) ─────────

describe("judgement layer — per-head classification", () => {
  it("splits a press and a pull that the canonical bucket lumped", () => {
    // OHP (Deltoids primary — generic label) on a push movement judges as
    // FRONT delts (Schoenfeld pp.186-187: the press trains the anterior
    // head); pull-ups' shoulder credit judges as REAR delts. The canonical
    // view files both under one "Shoulders".
    const week = [
      day([
        ex({
          exerciseId: "overhead-press",
          movementCategory: "vertical_push",
          sets: 4,
        }),
        ex({
          exerciseId: "pull-ups",
          movementCategory: "vertical_pull",
          sets: 3,
        }),
      ]),
    ];
    const judged = new Map(
      weeklyVolumeByJudgementMuscle(week).map((v) => [v.muscle, v.sets])
    );
    expect(judged.get("FrontDelts")).toBe(4);
    // pull-ups: Back primary (→ Lats), Shoulders secondary → RearDelts 1.0
    expect(judged.get("RearDelts")).toBe(3);
    expect(judged.get("Lats")).toBe(3);
    expect(judged.get("SideDelts")).toBeUndefined();
  });

  it("a squat books ZERO ab sets — direct core work only (RP counting)", () => {
    const week = [
      day([
        ex({
          exerciseId: "squat",
          movementCategory: "knee_dominant",
          sets: 5,
        }),
        ex({
          exerciseId: "cable-crunch",
          movementCategory: "core",
          sets: 2,
          isAccessory: true,
        }),
      ]),
    ];
    const judged = new Map(
      weeklyVolumeByJudgementMuscle(week).map((v) => [v.muscle, v.sets])
    );
    // The squat's "Core" secondary is stabilisation, not ab training; only
    // the crunch counts. (The DB lists Core as a secondary on 38 compounds —
    // counting them read Core as 22-39 weekly sets on two crunch slots.)
    expect(judged.get("Abs")).toBe(2);
  });

  it("a row still counts once toward its region (dedupe holds at this layer)", () => {
    // barbell-row: Lats primary + Lower Back secondary — different judgement
    // groups now (Lats / LowerBack), so BOTH earn credit; but a lift whose
    // primary and secondary land in the SAME group must count once.
    const week = [
      day([
        ex({
          exerciseId: "standing-calf-raise",
          movementCategory: "knee_dominant",
          sets: 4,
        }),
      ]),
    ];
    // Calves primary (Gastrocnemius) + Soleus secondary → one Calves group.
    expect(
      weeklyVolumeByJudgementMuscle(week).find((v) => v.muscle === "Calves")
        ?.sets
    ).toBe(4);
  });

  it("judgementLandmark: kept groups delegate; split groups scale by goal", () => {
    // Kept group — byte-identical to the generic band.
    expect(judgementLandmark("hypertrophy", "Quads")).toEqual(
      volumeLandmark("hypertrophy")
    );
    // Split group at the hypertrophy anchor — the authored prior, verbatim.
    expect(judgementLandmark("hypertrophy", "SideDelts")).toEqual({
      mv: 0,
      low: 8,
      high: 26,
    });
    // Goal scaling: strength generic high is 14 vs hypertrophy's 20, so the
    // side-delt ceiling scales 26 × 14/20 ≈ 18. A zero floor stays zero at
    // every goal — front delts can never read "below target".
    expect(judgementLandmark("strength", "SideDelts").high).toBe(18);
    expect(judgementLandmark("strength", "FrontDelts").low).toBe(0);
    expect(judgementLandmark("fat_loss", "FrontDelts").low).toBe(0);
  });

  it("generic delt credit follows the movement (push→front, pull→rear)", () => {
    // A custom (non-DB) vertical push attributes DeltsUnspecified via the
    // category fallback; the judgement layer must land it on FrontDelts.
    const week = [
      day([
        ex({
          exerciseId: "my-custom-press",
          movementCategory: "vertical_push",
          sets: 3,
        }),
      ]),
    ];
    expect(
      weeklyVolumeByJudgementMuscle(week).find((v) => v.muscle === "FrontDelts")
        ?.sets
    ).toBe(3);
  });
});
