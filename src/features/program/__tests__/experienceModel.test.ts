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
import { exerciseBank } from "../variationBank";
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

  it("documents the LIMITED-EQUIPMENT residue as bank coverage, not a gate bug", () => {
    // On home_gym/minimal a beginner still receives technical movements, and
    // this test exists to stop anyone (me included) "fixing" that in the
    // filter again. Both attempts were measured over a 216-config matrix:
    //
    //   no complexity clause      603 complexity / 462 equipment violations
    //   AND-ed into the picker    315 complexity / 798 equipment  ← WORSE
    //   preferred w/ fallback     603 / 462                        ← no-op
    //
    // The middle one shipped briefly in 646eeec and was reverted: it does not
    // find simpler movements, it finds none and leaves the user holding a
    // barbell they do not own. The cause is that `knee_dominant` has exactly
    // one non-primary a dumbbells-and-a-bench user owns, and it is the
    // Bulgarian split squat. The fix is to put simple dumbbell/bodyweight
    // options in the bank — the catalog already has goblet squat, lunges,
    // push-ups and inverted rows, which the TEMPLATES use and the bank does
    // not.
    const homeGym = buildPlan(
      planInput({ equipment: "home_gym", liftDays: 4 }) as Parameters<
        typeof buildPlan
      >[0]
    );
    const leaked = overLevel(homeGym.programState.workouts, "beginner");
    // Asserted as a KNOWN residue, so the day the bank gains coverage this
    // test fails and gets tightened rather than silently passing forever.
    expect(leaked.length).toBeGreaterThan(0);
    expect(
      leaked.every((e) => (e.exerciseId ?? "") === "bulgarian-split"),
      `unexpected leak: ${leaked.map((e) => e.exerciseId).join(", ")}`
    ).toBe(true);
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
