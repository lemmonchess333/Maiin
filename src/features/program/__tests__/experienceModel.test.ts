import { describe, it, expect } from "vitest";

import {
  allowsComplexity,
  applyComplexityGate,
  showsRpeByDefault,
  toExperience,
  usesUndulation,
} from "../experienceModel";
import { generateProgram } from "../programEngine";
import { exerciseBank } from "../variationBank";
import type { WorkoutDay } from "../programTypes";

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
