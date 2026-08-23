/**
 * A double progression with no authored rep range must still progress.
 *
 * `repRangeMax` is stamped by `generateProgram`'s final pass, so a freshly
 * generated plan always has one and the range-aware arm of `applyProgression`
 * runs. Three LIVE writers produce exercises WITHOUT one, and this file drives
 * two of them directly rather than hand-building the shape:
 *
 *   1. the v3 coverage backfill in `migrations.ts`, which appends calf raises
 *      and a lateral raise as `progressionType: "double"` with no range — it
 *      ran against every stored document on 2026-08-04, so the affected
 *      exercises are in real users' plans right now;
 *   2. `templateExToProgEx`, which leaves per-side forms ("10/leg") range-less
 *      — 15 of the 245 authored template exercises;
 *   3. any document generated before backlog #7 stamped ranges at all.
 *
 * All three fell to the legacy arm, which fires only when the lifter
 * SPONTANEOUSLY exceeds the prescription by two. The target itself never
 * moved, so a lifter who does exactly what the app asks for never progresses.
 * Measured before the fix over 12 compliant sessions: the migration's calf
 * raise sat at 3×12@40 kg for all twelve while a ranged accessory beside it
 * took three load steps.
 *
 * ADR-0008: the SERVER copy is the one that runs (session completion goes
 * through `programCommands` → `functions/lib/progressionEngine.js`), so every
 * behaviour case here asserts against BOTH engines, server first. Byte-level
 * parity across the whole input matrix is `applyProgression.cross.test.ts`'s
 * job — including the `repRangeMax: undefined` × `double` rows this fix
 * changes, which is why that test is the mirror guard and this one is the
 * behaviour guard.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { applyProgression as clientApplyProgression } from "@/features/program/programEngine";
import { migrateProgramState } from "@/features/program/migrations";
import {
  parseTemplateReps,
  templateExToProgEx,
} from "@/features/program/templateConversion";
import type {
  Goal,
  ProgramExercise,
  ProgramState,
} from "@/features/program/programTypes";

const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/progressionEngine") as {
  applyProgression: (
    exercise: ProgramExercise,
    actualReps: number,
    actualWeight: number,
    goal: Goal,
    microloading: boolean,
    actualRpe?: number,
    now?: number
  ) => ProgramExercise;
};

/** Run a session on both engines and assert they agree before returning. */
function bothEngines(
  ex: ProgramExercise,
  actualReps: number,
  actualWeight: number
): ProgramExercise {
  const server = cf.applyProgression(
    ex,
    actualReps,
    actualWeight,
    "recomp",
    false,
    undefined,
    0
  );
  const client = clientApplyProgression(
    ex,
    actualReps,
    actualWeight,
    "recomp",
    false
  );
  expect(
    { reps: server.reps, weight: server.weight, notes: server.notes ?? null },
    "server and client disagreed"
  ).toEqual({
    reps: client.reps,
    weight: client.weight,
    notes: client.notes ?? null,
  });
  return server;
}

/** A compliant lifter: hits the target exactly, at the prescribed load. */
function compliantSessions(start: ProgramExercise, n: number) {
  let ex = start;
  const seen: string[] = [];
  for (let i = 0; i < n; i++) {
    ex = bothEngines(ex, ex.reps, ex.weight);
    seen.push(`${ex.reps}@${ex.weight}`);
  }
  return { final: ex, seen };
}

/* ─── the writers, driven for real ──────────────────────────────── */

/** Minimal week-11-shaped document that trips the v3 coverage backfill. */
function docMissingCoverage(): ProgramState {
  const main = (
    name: string,
    exerciseId: string,
    movementCategory: string,
    instanceId: string,
    weight: number
  ) => ({
    name,
    exerciseId,
    instanceId,
    movementCategory,
    sets: 3,
    reps: 8,
    baseReps: 8,
    baseSets: 3,
    weight,
    repRangeMax: 11,
    progressionType: "double",
    lastSuccessfulWeight: weight,
    lastAttemptedWeight: weight,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
  });
  return {
    goal: "recomp",
    currentPhase: "accumulation",
    weekNumber: 11,
    splitType: "upper_lower",
    fatigueScore: 0,
    updatedAt: 0,
    programSchemaVersion: 2,
    liftWeekKey: "2026-08-02",
    runDays: [],
    workouts: [
      {
        dayNumber: 1,
        dayName: "Lower",
        exercises: [
          main("Barbell Squat", "barbell-squat", "knee_dominant", "a", 80),
        ],
      },
      {
        dayNumber: 2,
        dayName: "Upper",
        exercises: [
          main("Overhead Press", "overhead-press", "vertical_push", "b", 40),
        ],
      },
    ],
  } as unknown as ProgramState;
}

function backfilledExercises(): ProgramExercise[] {
  const migrated = migrateProgramState(docMissingCoverage(), "2026-08-09");
  return migrated.workouts
    .flatMap((d) => d.exercises)
    .filter((e) => !["a", "b"].includes(e.instanceId ?? ""));
}

describe("range-less double progression — the v3 coverage backfill", () => {
  it("still writes range-less doubles (the shape under test is real)", () => {
    const added = backfilledExercises();
    expect(added.map((e) => e.name)).toEqual([
      "Standing Calf Raise",
      "Lateral Raise",
    ]);
    for (const e of added) {
      expect(e.progressionType).toBe("double");
      expect(e.repRangeMax).toBeUndefined();
    }
  });

  it("progresses a migration-added accessory instead of freezing it", () => {
    const calf = backfilledExercises()[0];
    expect(`${calf.sets}x${calf.reps}@${calf.weight}`).toBe("3x12@40");

    // Twelve compliant sessions, pinned in full. Pre-fix EVERY entry read
    // "12@40" — the whole sequence was the same cell repeated twelve times.
    const { seen, final } = compliantSessions(calf, 12);
    expect(seen).toEqual([
      "13@40",
      "14@40",
      "12@42.5",
      "13@42.5",
      "14@42.5",
      "12@45",
      "13@45",
      "14@45",
      "12@47.5",
      "13@47.5",
      "14@47.5",
      "12@50",
    ]);
    // Four complete climb-then-load-step cycles: +10 kg over twelve sessions.
    expect(final.weight).toBe(50);
  });

  it("the load step lands on the SAME rep count the legacy arm used", () => {
    /* The claim the fallback rests on: `resetReps + 2` is not a new number,
       it is the overshoot the legacy arm already stepped the load at. So a
       lifter who volunteers the two extra reps sees exactly what they saw
       before — same load, same reset target. */
    const calf = backfilledExercises()[0]; // 3x12@40, baseReps 12
    const overshoot = bothEngines(calf, 14, 40);
    expect(overshoot.weight).toBe(42.5);
    expect(overshoot.reps).toBe(12);
  });
});

describe("range-less double progression — template per-side forms", () => {
  it("progresses a per-side accessory", () => {
    const lunge = templateExToProgEx(
      {
        name: "Walking Lunge",
        exerciseId: "walking-lunge",
        sets: 3,
        reps: "10/leg",
        restSeconds: 60,
        isAccessory: true,
      },
      "double"
    );
    expect(lunge.progressionType).toBe("double");
    expect(lunge.repRangeMax).toBeUndefined();

    const { seen } = compliantSessions(
      {
        ...lunge,
        weight: 20,
        lastSuccessfulWeight: 20,
        lastAttemptedWeight: 20,
      },
      4
    );
    // 1.25 kg steps, not 2.5 — a 20 kg lift is below HEAVY_LOAD_KG, so the
    // microplate step applies (backlog #7's proportional load step).
    expect(seen).toEqual(["11@20", "12@20", "10@21.25", "11@21.25"]);
  });

  it("keeps an authored range that sits inside a per-side form", () => {
    /* "8-10/leg" fell past the numeric-range branch (the `/leg` suffix breaks
       its anchor) and came out as a bare 8 with no ceiling — the author wrote
       a range and the conversion deleted it. Two template exercises use this
       form. */
    expect(parseTemplateReps("8-10/leg")).toEqual({ reps: 8, repRangeMax: 10 });
    expect(parseTemplateReps("12-15/side")).toEqual({
      reps: 12,
      repRangeMax: 15,
    });
    // Plain per-side forms still carry no range, and a descending pair is
    // still treated as a single number rather than an inverted range.
    expect(parseTemplateReps("10/leg")).toEqual({ reps: 10 });
    expect(parseTemplateReps("10-10/leg")).toEqual({ reps: 10 });
    // The unit simplification is unchanged: per-side reps stay plain reps.
    expect(parseTemplateReps("8-10/leg").repUnit).toBeUndefined();
  });
});

/* ─── the arms that must NOT change ─────────────────────────────── */

function bodyweight(overrides: Record<string, unknown> = {}): ProgramExercise {
  return {
    name: "Pull-Ups",
    exerciseId: "pull-ups",
    instanceId: "bw",
    movementCategory: "vertical_pull",
    sets: 4,
    reps: 8,
    baseReps: 8,
    baseSets: 4,
    weight: 0,
    progressionType: "double",
    lastSuccessfulWeight: 0,
    lastAttemptedWeight: 0,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...overrides,
  } as unknown as ProgramExercise;
}

describe("range-less double progression — the ceilings", () => {
  it("a range-less bodyweight lift climbs, and toward 20 — not baseReps+2", () => {
    /* The implied ceiling is class-dependent, and getting this wrong is the
       obvious way to break it: `resetReps + 2` on a pull-up would tell a
       lifter to strap on a weight vest at TEN reps. 20 is the number
       `bumpBodyweightReps` already falls back to when no range is authored,
       so the fallback inherits it rather than inventing one. */
    expect(bothEngines(bodyweight(), 8, 0).reps).toBe(9); // was frozen at 8
    // Ten pull-ups is nowhere near "add a weight vest" — under a resetReps+2
    // ceiling it would be exactly that.
    expect(bothEngines(bodyweight(), 10, 0).notes ?? null).toBeNull();
    expect(bothEngines(bodyweight(), 10, 0).reps).toBe(11);
    const atCap = bothEngines(bodyweight({ reps: 19, baseReps: 19 }), 20, 0);
    expect(atCap.notes).toMatch(/add load/i);
  });

  it("leaves timed holds exactly as they were — at ANY hold length", () => {
    /* The seconds axis keeps today's behaviour until it is looked at on its
       own terms: a hold climbs in 5-second steps toward MAX_HOLD_SECONDS, and
       a rep-derived ceiling means nothing to it.
     *
     * The length sweep is the point, and dropping the `isTimed` guard passes
     * without it. Every timed exercise id is also a bodyweight one, so a long
     * hold is protected by arithmetic alone — MAX_BODYWEIGHT_REPS (20) is
     * below a 30-second plank, so the ceiling is already discarded. It is the
     * SHORT hold where the guard does the work, and short holds are reachable:
     * the failure deload walks a hold down in 5-second steps to a 10-second
     * floor (LIFT-EV-01), so any lifter who misses a 20-second plank three
     * times lands under the rep constant.
     *
     * Without the guard those two lengths would behave DIFFERENTLY — a 15s
     * hold climbing on an exact-target session while a 30s one stays put —
     * which is a worse state than either rule applied consistently. */
    const plank = (reps: number) =>
      bodyweight({
        name: "Plank",
        exerciseId: "plank",
        repUnit: "seconds",
        reps,
        baseReps: reps,
      });
    for (const seconds of [10, 15, 19, 30, 45]) {
      expect(
        bothEngines(plank(seconds), seconds, 0).reps,
        `${seconds}s hold moved on an exact-target session`
      ).toBe(seconds);
    }
    // The legacy +2 overshoot still drives the 5-second bump, unchanged.
    expect(bothEngines(plank(30), 32, 0).reps).toBe(35);
    expect(bothEngines(plank(15), 17, 0).reps).toBe(20);
  });

  it("leaves the LINEAR path alone, including its own separate gap", () => {
    /* The fallback is scoped to `progressionType === "double"`, and this pins
       that scope from the other side.
     *
     * Worth being explicit about what is being pinned, because it is NOT that
     * the linear arm is healthy. The weighted linear arm consults
     * `microloading`: with it ON (the default in onboarding, planBuilder,
     * useProgram and the server command defaults alike) a completed session
     * adds 1 kg, so the lift moves. With the user's own Programme-settings
     * toggle OFF it needs the same +2 overshoot the double arm needed, and a
     * compliant lifter is frozen exactly as this file's subjects were.
     *
     * That is a real second gap, deliberately left alone here: what a linear
     * progression should do without microplates is a training-policy question
     * (a full 2.5 kg plate pair every session is a different programme, not a
     * bug fix), and the evidence handoff bars inferring that unilaterally.
     * Widening this fallback to cover it would smuggle that decision in. */
    const linearEx = bodyweight({
      exerciseId: "barbell-bench-press",
      movementCategory: "horizontal_push",
      weight: 60,
      lastSuccessfulWeight: 60,
      lastAttemptedWeight: 60,
      progressionType: "linear",
    });
    const goal: Goal = "recomp";
    for (const microloading of [true, false]) {
      const server = cf.applyProgression(
        linearEx,
        8,
        60,
        goal,
        microloading,
        undefined,
        0
      );
      const client = clientApplyProgression(
        linearEx,
        8,
        60,
        goal,
        microloading
      );
      expect(server.weight).toBe(client.weight);
      expect(server.reps).toBe(8);
      // microloading on → +1 kg; off → unchanged (the pre-existing gap).
      expect(server.weight).toBe(microloading ? 61 : 60);
    }
  });

  it("leaves an AUTHORED range alone", () => {
    const ranged = bothEngines(
      bodyweight({
        exerciseId: "leg-curl",
        weight: 30,
        lastSuccessfulWeight: 30,
        lastAttemptedWeight: 30,
        reps: 12,
        baseReps: 12,
        repRangeMax: 15,
      }),
      12,
      30
    );
    expect(ranged.reps).toBe(13);
    expect(ranged.weight).toBe(30);
  });
});
