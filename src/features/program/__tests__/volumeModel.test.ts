import { describe, it, expect } from "vitest";
import {
  weeklyVolumeByMuscle,
  weeklyVolumeByJudgementMuscle,
  volumeLandmark,
  judgementLandmark,
  classifyVolume,
  classifyVolumeDose,
  SECONDARY_SET_WEIGHT,
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
