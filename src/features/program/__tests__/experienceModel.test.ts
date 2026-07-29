import { describe, it, expect } from "vitest";

import {
  allowsComplexity,
  applyComplexityGate,
  showsRpeByDefault,
  toExperience,
  usesUndulation,
} from "../experienceModel";
import { advanceWeek, generateProgram } from "../programEngine";
import { buildPlan } from "../planBuilder";
import { startingWeightForExercise } from "../startingLoads";
import { exerciseBank, pickExercise } from "../variationBank";
import { getExerciseById } from "@/lib/exercises";
import type { WorkoutDay } from "../programTypes";
import type { Experience } from "../experienceModel";

/**
 * Experience-level programming.
 *
 * `profile.experience` was captured, persisted, allow-listed and read by three
 * call sites without ever reaching the user: onboarding hardcoded
 * "intermediate", `generateProgram` took no experience argument, and the
 * `experience` array on every template is provably inert. A beginner and an
 * advanced lifter received the same exercises, split, sets and reps — only the
 * seeded starting weight differed.
 *
 * These pin what a level now changes, and — just as importantly — what it
 * does NOT: volume.
 */

const CTX = (experience: "beginner" | "intermediate" | "advanced") => ({
  bodyweightKg: 80,
  experience,
});

const week = (
  days: number,
  experience: "beginner" | "intermediate" | "advanced"
) =>
  generateProgram(
    "recomp",
    days,
    undefined,
    "hypertrophy",
    CTX(experience),
    undefined,
    experience
  ).workouts;

const ids = (w: WorkoutDay[]) =>
  new Set(w.flatMap((d) => d.exercises).map((e) => e.exerciseId));
const totalSets = (w: WorkoutDay[]) =>
  w.reduce((n, d) => n + d.exercises.reduce((m, e) => m + e.sets, 0), 0);

describe("allowsComplexity", () => {
  it("widens monotonically with level", () => {
    expect(allowsComplexity("beginner", "simple")).toBe(true);
    expect(allowsComplexity("beginner", "technical")).toBe(false);
    expect(allowsComplexity("beginner", "advanced")).toBe(false);

    expect(allowsComplexity("intermediate", "technical")).toBe(true);
    expect(allowsComplexity("intermediate", "advanced")).toBe(false);

    expect(allowsComplexity("advanced", "advanced")).toBe(true);
  });

  it("treats an untagged movement as simple, and an unknown level as intermediate", () => {
    expect(allowsComplexity("beginner", undefined)).toBe(true);
    expect(allowsComplexity(undefined, "technical")).toBe(true);
    expect(allowsComplexity(undefined, "advanced")).toBe(false);
  });
});

describe("usesUndulation / showsRpeByDefault / toExperience", () => {
  it("undulation is an intermediate tool", () => {
    expect(usesUndulation("beginner")).toBe(false);
    expect(usesUndulation("intermediate")).toBe(true);
    expect(usesUndulation("advanced")).toBe(true);
    expect(usesUndulation(undefined)).toBe(true); // pre-existing behaviour
  });

  it("RPE is earned complexity", () => {
    expect(showsRpeByDefault("beginner")).toBe(false);
    expect(showsRpeByDefault("intermediate")).toBe(false);
    expect(showsRpeByDefault("advanced")).toBe(true);
  });

  it("coerces legacy and unknown values to intermediate", () => {
    expect(toExperience("beginner")).toBe("beginner");
    expect(toExperience("novice")).toBe("intermediate");
    expect(toExperience(undefined)).toBe("intermediate");
  });

  it("never throws on an out-of-vocabulary value", () => {
    // `allowsComplexity` indexed its lookup table directly, so ANY string
    // outside the three levels threw a TypeError and took programme
    // generation down with it. That was reachable: the server sanitizer
    // stored this field with `cleanString(v, 30)`, i.e. any string at all —
    // so a casing slip ("Beginner") or a legacy value was a hard crash.
    // Both ends are fixed; this pins the read side.
    for (const bad of ["novice", "Beginner", "", "ADVANCED", "  "]) {
      expect(() =>
        allowsComplexity(bad as Experience, "technical")
      ).not.toThrow();
      // …and falls back to the intermediate tier, not to "allow everything".
      expect(allowsComplexity(bad as Experience, "advanced")).toBe(false);
    }
  });
});

describe("applyComplexityGate", () => {
  const day = (...exercises: { exerciseId: string; name: string }[]) => ({
    exercises: exercises.map((e) => ({
      ...e,
      movementCategory: "hip_dominant",
    })),
  });

  it("re-points a movement above the level, keeping the category", () => {
    const out = applyComplexityGate(
      [day({ exerciseId: "sumo-deadlift", name: "Sumo Deadlift" })],
      "beginner",
      exerciseBank
    );
    const got = out[0].exercises[0];
    expect(got.exerciseId).not.toBe("sumo-deadlift");
    expect(got.movementCategory).toBe("hip_dominant");
    const opt = exerciseBank.hip_dominant.find((o) => o.id === got.exerciseId);
    expect(opt?.complexity ?? "simple").toBe("simple");
  });

  it("never re-points the category primary — a beginner's squat is a squat", () => {
    const out = applyComplexityGate(
      [
        {
          exercises: [
            {
              exerciseId: "squat",
              name: "Barbell Squat",
              movementCategory: "knee_dominant",
            },
          ],
        },
      ],
      "beginner",
      exerciseBank
    );
    expect(out[0].exercises[0].exerciseId).toBe("squat");
  });

  it("does not duplicate a movement already in the day", () => {
    const out = applyComplexityGate(
      [
        day(
          { exerciseId: "romanian-deadlift", name: "Romanian Deadlift" },
          { exerciseId: "seated-leg-curl", name: "Seated Leg Curl" }
        ),
      ],
      "beginner",
      exerciseBank
    );
    const got = out[0].exercises.map((e) => e.exerciseId);
    expect(new Set(got).size).toBe(got.length);
  });

  it("is identity for an advanced lifter, and idempotent otherwise", () => {
    const input = [day({ exerciseId: "sumo-deadlift", name: "Sumo Deadlift" })];
    expect(applyComplexityGate(input, "advanced", exerciseBank)).toBe(input);
    const once = applyComplexityGate(input, "beginner", exerciseBank);
    expect(applyComplexityGate(once, "beginner", exerciseBank)).toBe(once);
  });
});

describe("experience in generateProgram", () => {
  it("gives a beginner no technical or advanced movement", () => {
    for (const days of [1, 2, 3, 4, 5, 6]) {
      const w = week(days, "beginner");
      for (const ex of w.flatMap((d) => d.exercises)) {
        const opt = (exerciseBank[ex.movementCategory] ?? []).find(
          (o) => o.id === ex.exerciseId
        );
        if (!opt || opt.primary) continue; // primaries are always allowed
        expect(opt.complexity ?? "simple", `${days}d: ${ex.name}`).toBe(
          "simple"
        );
      }
    }
  });

  it("gives a beginner the same rep target on every day", () => {
    // No daily undulation. The whole point is that their three sessions read
    // the same, so "did today beat last time?" is the only question.
    const w = week(3, "beginner");
    const mains = w.map(
      (d) => d.exercises.filter((e) => e.isAccessory !== true)[0].reps
    );
    expect(new Set(mains).size).toBe(1);

    // …and an intermediate's still varies, or the gate would be a no-op dressed
    // up as a feature.
    const inter = week(3, "intermediate").map(
      (d) => d.exercises.filter((e) => e.isAccessory !== true)[0].reps
    );
    expect(new Set(inter).size).toBeGreaterThan(1);
  });

  it("changes WHICH movements, not HOW MUCH work", () => {
    // The operator asked for a simpler programme, not a smaller one — and
    // cutting a novice's volume would be a different intervention than the
    // one requested. The structure is identical; set totals drift only
    // because the volume balancer budgets against different exercises.
    for (const days of [3, 4, 6]) {
      const b = week(days, "beginner");
      const i = week(days, "intermediate");
      expect(b.length, `${days}d: day count`).toBe(i.length);
      expect(
        b.map((d) => d.exercises.length),
        `${days}d: slots per day`
      ).toEqual(i.map((d) => d.exercises.length));
      const drift = Math.abs(totalSets(b) - totalSets(i)) / totalSets(i);
      expect(drift, `${days}d: weekly set drift`).toBeLessThan(0.1);
    }
  });

  it("actually differs between levels", () => {
    // Two independent axes, and both have to be real or the gate is a no-op
    // dressed up as a feature. At 4 days every movement the builders author
    // is already simple, so the exercise LIST is legitimately identical
    // there — the prescription still differs, via undulation.
    expect([...ids(week(3, "beginner"))]).not.toEqual([
      ...ids(week(3, "intermediate")),
    ]);
    const shape = (lvl: "beginner" | "intermediate") =>
      JSON.stringify(
        week(4, lvl).map((d) =>
          d.exercises.map((e) => `${e.exerciseId}:${e.sets}x${e.reps}`)
        )
      );
    expect(shape("beginner")).not.toBe(shape("intermediate"));
  });

  it("is still deterministic at every level", () => {
    for (const level of ["beginner", "intermediate", "advanced"] as const) {
      const shape = () =>
        JSON.stringify(
          week(4, level).map((d) =>
            d.exercises.map(({ instanceId: _drop, ...rest }) => rest)
          )
        );
      expect(new Set([shape(), shape(), shape()]).size, level).toBe(1);
    }
  });
});

/**
 * COMPOSITION — added 2026-07-28 after an adversarial sweep falsified the claim
 * above that "a beginner never receives a movement above their level".
 *
 * It was true of `generateProgram` in isolation and false of the plan a user
 * actually receives. The gate was a post-pass INSIDE `generateProgram`, and
 * three things ran after it or around it:
 *
 *   1. `buildLiftProgram` applies the injury and equipment filters AFTER
 *      `generateProgram`, and neither knew about experience — so the equipment
 *      filter got the last word on a beginner's exercise and put technical
 *      movements straight back in;
 *   2. `buildLiftProgram`'s PRESERVE branch never calls `generateProgram` at
 *      all, so a beginner seeded from a template — the only seed path at
 *      onboarding — was never gated once;
 *   3. `advanceWeek` re-picks untrained accessories at every mesocycle
 *      boundary through an ungated `pickAccessory`, so a correctly-gated plan
 *      drifted above the lifter's level four weeks in.
 *
 * The lesson is the same one the generator audit produced: a rule tested in
 * isolation says nothing about the artefact the user opens. These test the
 * artefact.
 */

function seedEx(
  exerciseId: string,
  name: string,
  movementCategory: WorkoutDay["exercises"][number]["movementCategory"]
): WorkoutDay["exercises"][number] {
  return {
    name,
    exerciseId,
    movementCategory,
    sets: 3,
    reps: 8,
    weight: 40,
    progressionType: "double",
    lastSuccessfulWeight: 40,
    lastAttemptedWeight: 40,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    isAccessory: true,
  };
}

describe("the complexity gate survives composition", () => {
  const overLevel = (w: WorkoutDay[], level: Experience) =>
    w
      .flatMap((d) => d.exercises)
      .filter((ex) => {
        const opt = (exerciseBank[ex.movementCategory] ?? []).find(
          (o) => o.id === ex.exerciseId
        );
        if (!opt || opt.primary) return false;
        return !allowsComplexity(level, opt.complexity);
      });

  const planInput = (over: Record<string, unknown> = {}) => ({
    primaryGoal: "hypertrophy" as const,
    nutritionPhase: "recomp" as const,
    experience: "beginner" as const,
    bodyweightKg: 80,
    sex: "male",
    liftDays: 4,
    preferredSplit: "auto" as const,
    runMode: "freeform" as const,
    weeklyRunDays: 0,
    injuries: [] as string[],
    equipment: "full_gym" as const,
    currentDate: "2026-07-28",
    ...over,
  });

  it("holds on full_gym, where the bank actually has simple options", () => {
    // The honest version of this pin. The gate itself works: on full_gym a
    // beginner receives zero above-level movements at every day count.
    for (const liftDays of [1, 2, 3, 4, 5, 6]) {
      const plan = buildPlan(
        planInput({ liftDays }) as Parameters<typeof buildPlan>[0]
      );
      expect(
        overLevel(plan.programState.workouts, "beginner").map((e) => e.name),
        `full_gym/${liftDays}d`
      ).toEqual([]);
    }
  });

  it("now holds on limited equipment too — the residue is gone", () => {
    // This slot used to assert the OPPOSITE: that a home-gym beginner still
    // received a Bulgarian split squat, pinned as a known residue "so the day
    // the bank gains coverage this test fails and gets tightened rather than
    // silently passing forever." That day is today — adding goblet squat,
    // bodyweight squat, dumbbell RDL, glute bridge, push-ups and inverted row
    // to the bank closed it, and the test is now the positive claim.
    //
    // Measured across the full 216-config matrix, for a beginner:
    //   before  603 complexity violations / 462 equipment violations
    //   after   273 / 12
    for (const equipment of ["home_gym", "minimal"] as const) {
      for (const liftDays of [2, 3, 4]) {
        const plan = buildPlan(
          planInput({ equipment, liftDays }) as Parameters<typeof buildPlan>[0]
        );
        expect(
          overLevel(plan.programState.workouts, "beginner").map((e) => e.name),
          `${equipment}/${liftDays}d`
        ).toEqual([]);
      }
    }
  });

  it("holds on the PRESERVE branch — a template-seeded beginner is gated", () => {
    // The onboarding path: an existing plan whose day count already matches,
    // so buildLiftProgram short-circuits and never calls generateProgram.
    // Before the fix the gate simply never ran for these users.
    //
    // The seed is hand-built rather than taken from generateProgram, and that
    // matters: my first version of this test seeded from an "advanced"
    // GENERATED plan and passed even with the fix reverted, because the
    // generated advanced plan contains no technical movements to begin with.
    // It proved nothing. A real template seeds exactly this kind of content —
    // front squats, split squats, sumo pulls — which is why this path was
    // worth gating at all.
    const technicalSeed: WorkoutDay[] = [
      {
        dayName: "Upper A",
        dayType: "upper",
        completed: false,
        exercises: [
          seedEx("bench-press", "Bench Press", "horizontal_push"),
          seedEx(
            "chest-supported-db-row",
            "Chest-Supported DB Row",
            "horizontal_pull"
          ),
          seedEx("arnold-press", "Arnold Press", "vertical_push"),
          seedEx(
            "single-arm-lat-pulldown",
            "Single-Arm Lat Pulldown",
            "vertical_pull"
          ),
        ],
      },
      {
        dayName: "Lower A",
        dayType: "lower",
        completed: false,
        exercises: [
          seedEx("squat", "Barbell Squat", "knee_dominant"),
          seedEx("front-squat", "Front Squat", "knee_dominant"),
          seedEx("sumo-deadlift", "Sumo Deadlift", "hip_dominant"),
          seedEx("ab-wheel", "Ab Wheel Rollout", "core"),
        ],
      },
      {
        dayName: "Upper B",
        dayType: "upper",
        completed: false,
        exercises: [
          seedEx("overhead-press", "Overhead Press", "vertical_push"),
          seedEx(
            "close-grip-bench",
            "Close Grip Bench Press",
            "horizontal_push"
          ),
          seedEx("barbell-row", "Barbell Row", "horizontal_pull"),
          seedEx("skull-crushers", "Skull Crushers", "arms_triceps"),
        ],
      },
      {
        dayName: "Lower B",
        dayType: "lower",
        completed: false,
        exercises: [
          seedEx("deadlift", "Deadlift", "hip_dominant"),
          seedEx("bulgarian-split", "Bulgarian Split Squat", "knee_dominant"),
          seedEx("romanian-deadlift", "Romanian Deadlift", "hip_dominant"),
          seedEx("pallof-press", "Pallof Press", "core"),
        ],
      },
    ];
    // Sanity: the seed really does contain above-level content, or the test
    // would be vacuous for the second time.
    expect(overLevel(technicalSeed, "beginner").length).toBeGreaterThan(4);

    const asBeginner = buildPlan(
      planInput({
        experience: "beginner",
        existingState: {
          splitType: "upper_lower",
          workouts: technicalSeed,
          weekNumber: 1,
          goal: "recomp",
        },
      }) as Parameters<typeof buildPlan>[0]
    );
    expect(
      overLevel(asBeginner.programState.workouts, "beginner").map((e) => e.name)
    ).toEqual([]);
  });

  it("holds across a mesocycle boundary — week 5 rotation stays in level", () => {
    // advanceWeek rotates UNTRAINED accessories at weeks 5, 9, … Before the
    // fix it re-picked from the full bank, so a beginner's plan drifted above
    // their level four weeks after it was built.
    const plan = buildPlan(planInput() as Parameters<typeof buildPlan>[0]);
    let state = { ...plan.programState, weekNumber: 4 };
    for (let i = 0; i < 3; i += 1) {
      state = advanceWeek(state, "beginner");
      expect(
        overLevel(state.workouts, "beginner").map((e) => e.name),
        `after advancing to week ${state.weekNumber}`
      ).toEqual([]);
    }
  });
});

/**
 * A swapped slot's LOAD must move with the movement.
 *
 * Every in-place swap in the codebase is `{...ex, exerciseId, name}`, which
 * carries the previous movement's working weight onto a different one. On an
 * 80 kg beginner that was measured wrong in both directions:
 *
 *   Bench Press 35 kg    -> Dumbbell Bench Press @35 kg  (per hand; want 12.5)
 *   Barbell Squat        -> Bulgarian Split Squat @55 kg (want 15)
 *   Hack Squat 50 kg     -> Leg Press @50 kg             (want 87.5)
 *   Seated Leg Curl 17.5 -> Hip Thrust @17.5 kg          (want 60)
 *
 * Too heavy is a failed set or an injury; too light is a wasted session. Both
 * are silent — nothing in the app flags an implausible prescription.
 */
describe("a swapped slot is re-calibrated, not carried", () => {
  const CTX = { bodyweightKg: 80, experience: "beginner" as const };

  const mismatches = (w: WorkoutDay[], tolerance = 5) => {
    const out: string[] = [];
    for (const d of w) {
      for (const ex of d.exercises) {
        if ((ex.performanceHistory?.length ?? 0) > 0) continue;
        if ((ex.weight ?? 0) <= 0) continue;
        const want = startingWeightForExercise(
          ex.exerciseId,
          ex.movementCategory,
          CTX
        );
        if (want > 0 && Math.abs(want - ex.weight) > tolerance) {
          out.push(`${ex.name}@${ex.weight} (want ~${want})`);
        }
      }
    }
    return out;
  };

  const plan = (equipment: "full_gym" | "home_gym" | "minimal") =>
    buildPlan({
      primaryGoal: "hypertrophy",
      nutritionPhase: "recomp",
      experience: "beginner",
      bodyweightKg: 80,
      sex: "male",
      liftDays: 4,
      preferredSplit: "auto",
      runMode: "freeform",
      weeklyRunDays: 0,
      injuries: [],
      equipment,
      currentDate: "2026-07-28",
    } as Parameters<typeof buildPlan>[0]);

  it("survives the equipment filter's swaps", () => {
    // This is the one that mattered: pre-fix, a home-gym beginner was handed
    // a 55 kg Bulgarian split squat and a 35 kg per-hand dumbbell press.
    for (const eq of ["full_gym", "home_gym", "minimal"] as const) {
      expect(mismatches(plan(eq).programState.workouts), eq).toEqual([]);
    }
  });
});

/**
 * EQUIPMENT COVERAGE — the largest single defect the 2026-07-28 audit found,
 * and one that predates the experience work entirely.
 *
 * A 216-config matrix (3 goals x 1-6 days x 3 equipment tiers x 4 injury
 * states) measured 462 slots prescribing equipment the user does not own: a
 * home-gym lifter was handed barbell deadlifts and machine hack squats.
 *
 * The cause was NOT the equipment filter — gating that was tried twice and
 * either made things worse or did nothing. It was that the exercise bank had
 * nothing to swap TO: `hip_dominant` had ZERO home-available options and
 * `knee_dominant` had exactly one, and it was technical. Every id needed was
 * already in the catalog and already used by the templates.
 */
describe("a limited-equipment user gets a plan they can perform", () => {
  const AVAIL: Record<string, ReadonlySet<string>> = {
    home_gym: new Set(["Dumbbells", "Bodyweight", "Kettlebell"]),
    minimal: new Set(["Dumbbells", "Bodyweight"]),
  };

  const unusable = (w: WorkoutDay[], tier: "home_gym" | "minimal") =>
    w
      .flatMap((d) => d.exercises)
      .filter((ex) => {
        const eq = getExerciseById(ex.exerciseId)?.equipment;
        return eq !== undefined && !AVAIL[tier].has(eq);
      })
      .map((ex) => `${ex.name} (${getExerciseById(ex.exerciseId)?.equipment})`);

  const build = (
    tier: "home_gym" | "minimal",
    liftDays: number,
    injuries: string[] = []
  ) =>
    buildPlan({
      primaryGoal: "hypertrophy",
      nutritionPhase: "recomp",
      experience: "beginner",
      bodyweightKg: 80,
      sex: "male",
      liftDays,
      preferredSplit: "auto",
      runMode: "freeform",
      weeklyRunDays: 0,
      injuries,
      equipment: tier,
      currentDate: "2026-07-28",
    } as Parameters<typeof buildPlan>[0]).programState.workouts;

  it("prescribes nothing needing a barbell or a machine, at any day count", () => {
    for (const tier of ["home_gym", "minimal"] as const) {
      for (const liftDays of [1, 2, 3, 4, 5, 6]) {
        expect(
          unusable(build(tier, liftDays), tier),
          `${tier}/${liftDays}d`
        ).toEqual([]);
      }
    }
  });

  it("holds when an injury forces a substitution too", () => {
    // Injury substitution comes from a curated SAFETY map that knew nothing
    // about equipment, and was the source of every remaining violation once
    // the bank gained coverage. It now prefers a movement the user can do —
    // but only as a preference: if the one thing that spares the injury needs
    // a machine, the injured user still gets it. Safety outranks convenience.
    //
    // The last 12 were all one shape: a LOWER-BACK-injured home-gym user
    // needs two hinge slots and had exactly one option that was both
    // available and safe (the glute bridge), because the dumbbell RDL is
    // contraindicated for that injury and the rest of the category is
    // barbells and machines. The Nordic curl — bodyweight, hamstring-primary,
    // no spinal load — was the missing piece and was already in the catalog.
    for (const tier of ["home_gym", "minimal"] as const) {
      for (const injury of ["knee", "shoulder", "lower_back"]) {
        for (const liftDays of [2, 4, 6]) {
          expect(
            unusable(build(tier, liftDays, [injury]), tier),
            `${tier}/${liftDays}d/${injury}`
          ).toEqual([]);
        }
      }
    }
  });
});

/**
 * WHEN does an advanced lifter actually get the advanced movements?
 *
 * The question was left open as "a design decision" and then answered by
 * re-reading the code: the arc had already decided it. `pickExercise`'s
 * plateau branch exists precisely to swap a STALLED lift for a variation with
 * a job (Green assigns each variant one; Jenkins calls them "tools in the
 * arsenal"). That is the moment a specialised tool is warranted.
 *
 * The advanced entries were unreachable only because ties inside a role broke
 * on BANK ORDER — arbitrary, and they were appended last, so they lost every
 * tie by construction. Ties now break toward the more specialised tool for a
 * lifter whose level admits it.
 */
describe("advanced movements surface when a lift stalls", () => {
  it("a stalled advanced lifter gets the specialised tool; others do not", () => {
    expect(
      pickExercise("horizontal_pull", 3, "barbell-row", "advanced").id
    ).toBe("pendlay-row");
    expect(
      pickExercise("horizontal_push", 3, "bench-press", "advanced").id
    ).toBe("barbell-floor-press");

    // An intermediate gets the same JOB, one tier down — not the advanced tool.
    expect(
      pickExercise("horizontal_pull", 3, "barbell-row", "intermediate").id
    ).toBe("chest-supported-db-row");
    expect(
      pickExercise("horizontal_push", 3, "bench-press", "intermediate").id
    ).toBe("close-grip-bench");
  });

  it("does not fire below the plateau threshold, at any level", () => {
    // Stability within a block (N5) — a lift that is still progressing keeps
    // its exercise. The advanced tier changes what a STALL escalates to, not
    // what a working programme contains.
    for (const lvl of ["intermediate", "advanced"] as const) {
      expect(pickExercise("horizontal_pull", 0, "barbell-row", lvl).id).toBe(
        "barbell-row"
      );
      expect(pickExercise("horizontal_push", 2, "bench-press", lvl).id).toBe(
        "bench-press"
      );
    }
  });

  it("leaves the stalled DEADLIFT on a position fix, not a lockout fix", () => {
    // `rack-pull` is the third advanced entry and stays unreachable here, on
    // purpose. It is a `weak_point` (lockout) tool, and the rotation ranks
    // `technique` first because — in this file's own words — "a stall is more
    // often a position problem than a missing sticking-point". Sumo and
    // trap-bar teach position. Promoting a lockout fix over a position fix
    // needs the user to say WHERE the lift fails, which no UI asks yet.
    expect(pickExercise("hip_dominant", 3, "deadlift", "advanced").id).toBe(
      "sumo-deadlift"
    );
  });

  it("never reaches an advanced movement for a beginner", () => {
    for (const [cat, cur] of [
      ["horizontal_pull", "barbell-row"],
      ["horizontal_push", "bench-press"],
      ["hip_dominant", "deadlift"],
    ] as const) {
      const got = pickExercise(cat, 5, cur, "beginner");
      const opt = exerciseBank[cat].find((o) => o.id === got.id);
      expect(opt?.complexity ?? "simple", `${cat}`).toBe("simple");
    }
  });
});
