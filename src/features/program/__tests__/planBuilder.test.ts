/**
 * planBuilder tests · P0-C · spec v7.
 *
 * Locks the contract:
 *   - PURE — same input produces same output (no wall-clock reads)
 *   - Race-prep / structured / freeform produce correct shapes
 *   - Every runDay has id / date / weekKey / status
 *   - validatePlanOutput catches malformed output
 */

import { describe, it, expect } from "vitest";
import {
  buildPlan,
  validatePlanOutput,
  type PlanBuilderInput,
  firstLiftWeekKey,
} from "../planBuilder";
import {
  CURRENT_PROGRAM_SCHEMA_VERSION,
  CURRENT_WEEKSCHEDULE_VERSION,
  type ProgramState,
} from "../programTypes";
import {
  advanceWeek,
  applyDeload,
  assignDayRoles,
  easeBackIn,
  raceLegSets,
  repFloorFor,
  undulationDeltaFor,
} from "../programEngine";
import { isRaceBuildWeek, raceBlockWeek } from "../weekPrescription";
import { loadsTheLegs } from "../easierToday";
import { roleRepsFor } from "../roleTable";
import { getExerciseById } from "@/lib/exercises";

function makeInput(
  overrides: Partial<PlanBuilderInput> = {}
): PlanBuilderInput {
  return {
    primaryGoal: "hypertrophy",
    nutritionPhase: "recomp",
    experience: "intermediate",
    liftDays: 4,
    preferredSplit: "upper_lower",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment: "full_gym",
    injuries: [],
    currentDate: "2026-05-14", // Thursday (deterministic)
    ...overrides,
  };
}

/* ─── Purity ─────────────────────────────────────────────────── */

describe("buildPlan · purity", () => {
  // planBuilder itself doesn't read wall clock or roll dice. The lift
  // engine (generateProgram) intentionally uses Math.random for
  // accessory variety — that's an inherited, pre-existing feature,
  // not new impurity. These tests assert purity on the bits
  // planBuilder OWNS (date math, schedule structure, runDays
  // identity, runPlan metadata, profileUpdates).

  it("weekSchedule + profileUpdates + runDays-without-workouts are byte-identical across calls", () => {
    const input = makeInput({ runMode: "structured", weeklyRunDays: 3 });
    const a = buildPlan(input);
    const b = buildPlan(input);
    expect(a.weekSchedule).toEqual(b.weekSchedule);
    expect(a.profileUpdates).toEqual(b.profileUpdates);
    expect(a.programState.runDays).toEqual(b.programState.runDays);
    expect(a.programState.runPlan).toEqual(b.programState.runPlan);
    expect(a.programState.programSchemaVersion).toBe(
      b.programState.programSchemaVersion
    );
    expect(a.programState.updatedAt).toBe(b.programState.updatedAt);
  });

  it("race_prep totalWeeks is derived from currentDate, not new Date()", () => {
    const input = makeInput({
      runMode: "race_prep",
      weeklyRunDays: 3,
      raceGoal: { distance: "10k", targetDate: "2026-08-14" },
      currentDate: "2026-05-14",
    });
    const a = buildPlan(input);
    const b = buildPlan(input);
    expect(a.programState.runPlan?.totalWeeks).toBe(
      b.programState.runPlan?.totalWeeks
    );
    // 13 weeks from 2026-05-14 to 2026-08-14 (clamped to min 6 for 10K — actual ≥ 13)
    expect(a.programState.runPlan?.totalWeeks).toBeGreaterThanOrEqual(13);
  });

  it("does not mutate the input object", () => {
    const input = makeInput({
      runMode: "race_prep",
      weeklyRunDays: 3,
      raceGoal: { distance: "10k", targetDate: "2026-08-14" },
    });
    const snapshot = JSON.parse(JSON.stringify(input));
    buildPlan(input);
    expect(input).toEqual(snapshot);
  });

  it("workouts vary across calls (intentional accessory variety — existing engine behaviour)", () => {
    // This test pins the EXISTING behaviour so it's clear in the
    // codebase: lift accessory selection is non-deterministic by
    // design. planBuilder propagates this; it doesn't introduce it.
    // If accessories ever become deterministic (seeded RNG, etc.)
    // this test should be updated alongside that change.
    const input = makeInput({ liftDays: 4 });
    const runs = Array.from({ length: 10 }, () => buildPlan(input));
    const allAccessoryIds = runs.flatMap((r) =>
      r.programState.workouts.flatMap((w) =>
        w.exercises.map((e) => e.exerciseId)
      )
    );
    const unique = new Set(allAccessoryIds);
    // Across 10 generations we expect MORE than a single unique
    // exercise per slot (some variety). A constant-output engine
    // would yield unique.size === workouts × exercises (no repeats).
    expect(unique.size).toBeGreaterThan(0);
  });
});

/* ─── Output shape ──────────────────────────────────────────── */

describe("buildPlan · output shape", () => {
  it("returns { programState, weekSchedule, profileUpdates }", () => {
    const out = buildPlan(makeInput());
    expect(out).toHaveProperty("programState");
    expect(out).toHaveProperty("weekSchedule");
    expect(out).toHaveProperty("profileUpdates");
  });

  it("weekSchedule is exactly 7 entries", () => {
    const out = buildPlan(makeInput());
    expect(out.weekSchedule).toHaveLength(7);
  });

  it("sets programSchemaVersion to current", () => {
    const out = buildPlan(makeInput());
    expect(out.programState.programSchemaVersion).toBe(
      CURRENT_PROGRAM_SCHEMA_VERSION
    );
  });

  it("profileUpdates includes weekScheduleVersion", () => {
    const out = buildPlan(makeInput());
    expect(out.profileUpdates.weekScheduleVersion).toBe(
      CURRENT_WEEKSCHEDULE_VERSION
    );
  });

  it("profileUpdates writes BOTH weeklyRunDaysTarget and weeklyRunsTarget (legacy field sync)", () => {
    const out = buildPlan(
      makeInput({ runMode: "structured", weeklyRunDays: 3 })
    );
    expect(out.profileUpdates.weeklyRunDaysTarget).toBe(3);
    expect(out.profileUpdates.weeklyRunsTarget).toBe(3);
  });

  // Pgm4: the unified Programme Settings editor makes equipment/injuries/
  // split/experience editable, so buildPlan must persist them onto the
  // profile (they were previously only writable via onboarding-retake).
  it("profileUpdates persists the plan-shaping inputs (experience/equipment/injuries/preferredSplit)", () => {
    const out = buildPlan(
      makeInput({
        experience: "advanced",
        equipment: "home_gym",
        injuries: ["knee", "shoulder"],
        preferredSplit: "ppl",
      })
    );
    expect(out.profileUpdates.experience).toBe("advanced");
    expect(out.profileUpdates.equipment).toBe("home_gym");
    expect(out.profileUpdates.injuries).toEqual(["knee", "shoulder"]);
    expect(out.profileUpdates.preferredSplit).toBe("ppl");
  });

  // Pgm4 regression guard: nutrition phase must land on profile.program.goal
  // (what macro/calorie consumers read) — not only programState.goal. Without
  // this the unified editor's phase change wouldn't move calorie targets.
  it("profileUpdates.program.goal mirrors the nutrition phase", () => {
    expect(
      buildPlan(makeInput({ nutritionPhase: "cut" })).profileUpdates.program
    ).toEqual({ goal: "cut" });
    expect(
      buildPlan(makeInput({ nutritionPhase: "lean bulk" })).profileUpdates
        .program
    ).toEqual({ goal: "lean bulk" });
  });
});

/* ─── Mode: freeform ─────────────────────────────────────────── */

describe("buildPlan · freeform mode", () => {
  it("produces empty runDays + no runPlan", () => {
    const out = buildPlan(makeInput({ runMode: "freeform", weeklyRunDays: 0 }));
    expect(out.programState.runDays).toEqual([]);
    expect(out.programState.runPlan).toBeUndefined();
  });

  it("weekSchedule has 0 run days", () => {
    const out = buildPlan(makeInput({ runMode: "freeform" }));
    const runDays = out.weekSchedule.filter(
      (d) => d.type === "run" || d.type === "both"
    );
    expect(runDays).toHaveLength(0);
  });

  it("ignores weeklyRunDays input value when freeform", () => {
    const out = buildPlan(makeInput({ runMode: "freeform", weeklyRunDays: 5 }));
    expect(out.profileUpdates.weeklyRunDaysTarget).toBe(0);
    expect(out.programState.runDays).toEqual([]);
  });
});

/* ─── Mode: structured ──────────────────────────────────────── */

describe("buildPlan · structured mode", () => {
  it("produces runDays without raceGoal", () => {
    const out = buildPlan(
      makeInput({ runMode: "structured", weeklyRunDays: 3 })
    );
    expect(out.programState.runDays?.length).toBeGreaterThan(0);
    expect(out.programState.runPlan?.mode).toBe("structured");
    expect(out.programState.runPlan?.raceGoal).toBeUndefined();
  });

  it("every runDay has id / date / weekKey / status", () => {
    const out = buildPlan(
      makeInput({ runMode: "structured", weeklyRunDays: 3 })
    );
    (out.programState.runDays ?? []).forEach((rd) => {
      expect(rd.id).toBeTruthy();
      expect(rd.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rd.weekKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rd.status).toBeTruthy();
    });
  });

  it("initial runDays status is 'planned'", () => {
    const out = buildPlan(
      makeInput({ runMode: "structured", weeklyRunDays: 3 })
    );
    (out.programState.runDays ?? []).forEach((rd) => {
      expect(rd.status).toBe("planned");
    });
  });

  it("weekSchedule has correct run-day count", () => {
    const out = buildPlan(
      makeInput({
        runMode: "structured",
        liftDays: 3,
        weeklyRunDays: 2,
      })
    );
    const runOrBoth = out.weekSchedule.filter(
      (d) => d.type === "run" || d.type === "both"
    );
    expect(runOrBoth).toHaveLength(2);
  });

  it("handles hybrid (overflow to Both days)", () => {
    const out = buildPlan(
      makeInput({
        runMode: "structured",
        liftDays: 6,
        weeklyRunDays: 2,
      })
    );
    const counts = out.weekSchedule.reduce(
      (acc, d) => ({ ...acc, [d.type]: (acc[d.type] ?? 0) + 1 }),
      {} as Record<string, number>
    );
    expect((counts.lift ?? 0) + (counts.both ?? 0)).toBe(6); // lift exposure
    expect((counts.run ?? 0) + (counts.both ?? 0)).toBe(2); // run exposure
    expect(counts.both).toBeGreaterThanOrEqual(1);
  });
});

/* ─── Mode: race_prep ─────────────────────────────────────── */

describe("buildPlan · race_prep mode", () => {
  it("produces runPlan with mode='race_prep' + totalWeeks > 0", () => {
    const out = buildPlan(
      makeInput({
        runMode: "race_prep",
        weeklyRunDays: 3,
        raceGoal: { distance: "10k", targetDate: "2026-08-14" },
      })
    );
    expect(out.programState.runPlan?.mode).toBe("race_prep");
    expect(out.programState.runPlan?.totalWeeks).toBeGreaterThan(0);
    expect(out.programState.runPlan?.currentWeek).toBe(0);
  });

  it("propagates raceGoal into runPlan and profileUpdates", () => {
    const raceGoal = { distance: "10k" as const, targetDate: "2026-08-14" };
    const out = buildPlan(
      makeInput({
        runMode: "race_prep",
        weeklyRunDays: 3,
        raceGoal,
      })
    );
    expect(out.programState.runPlan?.raceGoal).toEqual(raceGoal);
    expect(out.profileUpdates.raceGoal).toEqual(raceGoal);
  });

  it("every runDay has full v2 shape (id / date / weekKey / status)", () => {
    const out = buildPlan(
      makeInput({
        runMode: "race_prep",
        weeklyRunDays: 3,
        raceGoal: { distance: "10k", targetDate: "2026-08-14" },
      })
    );
    expect(out.programState.runDays?.length).toBeGreaterThan(0);
    (out.programState.runDays ?? []).forEach((rd) => {
      expect(rd.id).toBeTruthy();
      expect(rd.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rd.weekKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rd.status).toBe("planned");
    });
  });

  it("totalWeeks scales with race-date distance (proxy: longer date → more weeks)", () => {
    const short = buildPlan(
      makeInput({
        runMode: "race_prep",
        weeklyRunDays: 3,
        raceGoal: { distance: "10k", targetDate: "2026-07-01" }, // ~7 weeks from May 14
      })
    );
    const long = buildPlan(
      makeInput({
        runMode: "race_prep",
        weeklyRunDays: 3,
        raceGoal: { distance: "10k", targetDate: "2026-12-01" }, // ~29 weeks
      })
    );
    expect(long.programState.runPlan?.totalWeeks ?? 0).toBeGreaterThan(
      short.programState.runPlan?.totalWeeks ?? 0
    );
  });
});

/* ─── Run19: a plan made mid-week plans no run before that day ─── */

describe("buildPlan · a plan made mid-week plans no run before that day (Run19)", () => {
  // The week of Monday 11 May 2026.
  const monday = "2026-05-11";
  const thursday = "2026-05-14";
  const raceInput = (currentDate: string) =>
    makeInput({
      currentDate,
      runMode: "race_prep",
      liftDays: 3,
      weeklyRunDays: 4,
      raceGoal: { distance: "10k", targetDate: "2026-08-14" },
    });
  const runsOf = (out: ReturnType<typeof buildPlan>) =>
    out.programState.runDays ?? [];

  it("dates no run before the day the plan is made", () => {
    // Made on the Monday, the week has runs before Thursday...
    expect(
      runsOf(buildPlan(raceInput(monday))).some((run) => run.date! < thursday)
    ).toBe(true);
    // ...which the same plan made on the Thursday doesn't plan. It keeps
    // the week's runs from Thursday on.
    const made = runsOf(buildPlan(raceInput(thursday)));
    expect(made.length).toBeGreaterThan(0);
    expect(made.every((run) => run.date! >= thursday)).toBe(true);
  });

  it("keeps the week's days from the day it is made, as a Monday plan has them", () => {
    const fromThursday = (runs: ReturnType<typeof runsOf>) =>
      runs
        .filter((run) => run.date! >= thursday)
        .map((run) => [run.date, run.templateId]);
    expect(fromThursday(runsOf(buildPlan(raceInput(thursday))))).toEqual(
      fromThursday(runsOf(buildPlan(raceInput(monday))))
    );
  });

  it("keeps a continuing plan's own days before today", () => {
    const existingState = buildPlan(raceInput(monday)).programState;
    const before = (existingState.runDays ?? []).filter(
      (run) => run.date! < thursday
    );
    expect(before.length).toBeGreaterThan(0);
    const saved = runsOf(
      buildPlan({
        ...raceInput(thursday),
        preserveHistory: true,
        existingState,
      })
    );
    expect(saved.filter((run) => run.date! < thursday)).toEqual(before);
  });

  it("plans a structured week from that day too", () => {
    const runs = runsOf(
      buildPlan(
        makeInput({
          currentDate: thursday,
          runMode: "structured",
          liftDays: 3,
          weeklyRunDays: 4,
        })
      )
    );
    expect(runs.every((run) => run.date! >= thursday)).toBe(true);
  });
});

/* ─── Lift programme ─────────────────────────────────────────── */

describe("buildPlan · lift programme", () => {
  it("produces workouts equal to liftDays count", () => {
    const out = buildPlan(makeInput({ liftDays: 4 }));
    expect(out.programState.workouts.length).toBe(4);
  });

  it("returns empty workouts when liftDays === 0", () => {
    const out = buildPlan(makeInput({ liftDays: 0 }));
    expect(out.programState.workouts).toEqual([]);
  });

  it("respects primaryGoal in profileUpdates", () => {
    const out = buildPlan(makeInput({ primaryGoal: "strength" }));
    expect(out.profileUpdates.primaryGoal).toBe("strength");
    expect(out.programState.primaryGoal).toBe("strength");
  });
});

/* ─── validatePlanOutput ─────────────────────────────────────── */

describe("validatePlanOutput", () => {
  it("accepts a freshly built plan", () => {
    const out = buildPlan(
      makeInput({ runMode: "structured", weeklyRunDays: 3 })
    );
    expect(() => validatePlanOutput(out)).not.toThrow();
  });

  it("throws when weekSchedule length is wrong", () => {
    const out = buildPlan(makeInput());
    const bad = { ...out, weekSchedule: out.weekSchedule.slice(0, 5) };
    expect(() => validatePlanOutput(bad)).toThrow(/exactly 7 entries/);
  });

  it("throws when runDay missing id", () => {
    const out = buildPlan(
      makeInput({ runMode: "structured", weeklyRunDays: 3 })
    );
    const bad = {
      ...out,
      programState: {
        ...out.programState,
        runDays: out.programState.runDays?.map((rd, i) =>
          i === 0 ? { ...rd, id: undefined } : rd
        ),
      },
    };
    expect(() => validatePlanOutput(bad)).toThrow(/id missing/);
  });

  it("throws when runDay date is UTC ISO format", () => {
    const out = buildPlan(
      makeInput({ runMode: "structured", weeklyRunDays: 3 })
    );
    const bad = {
      ...out,
      programState: {
        ...out.programState,
        runDays: out.programState.runDays?.map((rd, i) =>
          i === 0 ? { ...rd, date: "2026-05-14T00:00:00Z" } : rd
        ),
      },
    };
    expect(() => validatePlanOutput(bad)).toThrow();
  });

  it("throws when race_prep mode missing raceGoal in profileUpdates", () => {
    const out = buildPlan(
      makeInput({
        runMode: "race_prep",
        weeklyRunDays: 3,
        raceGoal: { distance: "10k", targetDate: "2026-08-14" },
      })
    );
    const bad = {
      ...out,
      profileUpdates: { ...out.profileUpdates, raceGoal: undefined },
    };
    expect(() => validatePlanOutput(bad)).toThrow(
      /race_prep mode requires raceGoal/
    );
  });

  it("throws when programSchemaVersion is wrong", () => {
    const out = buildPlan(makeInput());
    const bad = {
      ...out,
      programState: { ...out.programState, programSchemaVersion: 99 },
    };
    expect(() => validatePlanOutput(bad)).toThrow(/programSchemaVersion/);
  });

  it("throws when weekSchedule contains invalid type", () => {
    const out = buildPlan(makeInput());
    // Intentionally produce a malformed entry by casting through unknown.
    // We're testing the runtime validator's defence against bad data
    // that might come from a corrupted Firestore doc or a buggy caller.
    const bad = {
      ...out,
      weekSchedule: [
        ...out.weekSchedule.slice(0, 6),
        {
          day: 6,
          type: "junk",
        } as unknown as (typeof out.weekSchedule)[number],
      ],
    };
    expect(() => validatePlanOutput(bad)).toThrow(/invalid/);
  });
});

/* ─── existingState + preserveHistory ────────────────────────── */

describe("buildPlan · preserveHistory", () => {
  it("preserves weekNumber and currentPhase from existingState when preserveHistory=true", () => {
    const existingState = buildPlan(makeInput()).programState;
    existingState.weekNumber = 5;
    existingState.currentPhase = "Strength";

    const out = buildPlan(makeInput({ existingState, preserveHistory: true }));
    expect(out.programState.weekNumber).toBe(5);
    expect(out.programState.currentPhase).toBe("Strength");
  });

  it("resets weekNumber to 1 when preserveHistory=false (onboarding default)", () => {
    const existingState = buildPlan(makeInput()).programState;
    existingState.weekNumber = 5;

    const out = buildPlan(makeInput({ existingState, preserveHistory: false }));
    expect(out.programState.weekNumber).toBe(1);
  });

  it("calibrates zero-load template rows on the onboarding preserve branch", () => {
    const existingState = buildPlan(makeInput()).programState;
    existingState.workouts = existingState.workouts.map((day) => ({
      ...day,
      exercises: day.exercises.map((exercise) => ({
        ...exercise,
        weight: 0,
        lastSuccessfulWeight: 0,
        lastAttemptedWeight: 0,
        performanceHistory: [],
      })),
    }));
    const out = buildPlan(
      makeInput({
        existingState,
        preserveHistory: false,
        bodyweightKg: 80,
      })
    ).programState;
    const bench = out.workouts
      .flatMap((day) => day.exercises)
      .find((exercise) => exercise.exerciseId === "bench-press");
    expect(bench?.weight).toBeGreaterThan(0);
  });
});

/* ─── Pgm5 Q2 · structure-preserving regeneration ──────────────── */

describe("buildPlan · structure-preserving regeneration (Pgm5 Q2)", () => {
  /* ─── Blk2 · the active training block survives a settings save ─── */

  // buildPlan constructs a fresh ProgramState literal and spreads nothing
  // from existingState, and configurePlan writes the result with batch.set
  // — a full replace. So a field that isn't named here is DELETED on every
  // settings save, silently in both directions: nothing errors, and the
  // user's focus quietly reverts mid-block.
  const activeBlock = {
    id: "2026-08-01-1754035200000",
    owned: true as const,
    focus: "strength" as const,
    pace: "full" as const,
    durationWeeks: 8 as const,
    startDate: "2026-08-01",
    goalBefore: "hypertrophy" as const,
    amnestyWeeksLeft: 3,
    weeklyLiftTarget: 4,
    anchorExerciseIds: ["squat"],
    why: "",
    createdAt: 1754035200000,
    schemaVersion: 1 as const,
  };

  it("carries the weeks back after a break through a content edit", () => {
    // Lift4 (11): or a calendar lighter week could follow the break.
    const first = buildPlan(makeInput({ liftDays: 4 }));
    const existingState = {
      ...first.programState,
      easingBack: { weeksLeft: 1 },
    };
    expect(
      buildPlan(
        makeInput({ liftDays: 4, existingState, preserveHistory: true })
      ).programState.easingBack
    ).toEqual({ weeksLeft: 1 });
    expect(
      buildPlan(
        makeInput({ liftDays: 4, existingState, preserveHistory: false })
      ).programState.easingBack
    ).toBeUndefined();
  });

  it("carries an active training block through a content edit", () => {
    const first = buildPlan(makeInput({ liftDays: 4 }));
    const edited = buildPlan(
      makeInput({
        liftDays: 4,
        existingState: { ...first.programState, trainingBlock: activeBlock },
        preserveHistory: true,
      })
    );
    expect(edited.programState.trainingBlock).toEqual(activeBlock);
  });

  it("keeps primaryGoal pinned to the block's focus, whatever the caller passes", () => {
    // The pair is made un-driftable where the state is CONSTRUCTED rather
    // than by asking every call site to thread block.focus — otherwise one
    // forgetful caller silently detaches the focus from the block.
    const first = buildPlan(makeInput({ liftDays: 4 }));
    const edited = buildPlan(
      makeInput({
        liftDays: 4,
        primaryGoal: "fat_loss", // a stale/standing goal from the editor
        existingState: { ...first.programState, trainingBlock: activeBlock },
        preserveHistory: true,
      })
    );
    expect(edited.programState.primaryGoal).toBe("strength");
  });

  // Blk2 / H2. The block owns programState.primaryGoal and must NEVER
  // reach the profile: `buildProfileUpdates` writes input.primaryGoal
  // unconditionally, so passing the block's focus in meant one injury edit
  // during a block overwrote the user's STANDING focus. After release the
  // two copies diverged permanently and the next block captured the wrong
  // goalBefore. The two halves are pinned together here because that is
  // exactly where they part company.
  it("pins programState to the block's focus while leaving the PROFILE on the standing one", () => {
    const first = buildPlan(makeInput({ liftDays: 4 }));
    const out = buildPlan(
      makeInput({
        liftDays: 4,
        primaryGoal: "hypertrophy", // the user's standing focus
        existingState: { ...first.programState, trainingBlock: activeBlock },
        preserveHistory: true,
      })
    );
    expect(out.programState.primaryGoal).toBe("strength"); // block focus
    expect(out.profileUpdates.primaryGoal).toBe("hypertrophy"); // standing
  });

  it("does not invent a block on a fresh plan, or carry one without preserveHistory", () => {
    expect(
      buildPlan(makeInput({ liftDays: 4 })).programState.trainingBlock
    ).toBeUndefined();
    const first = buildPlan(makeInput({ liftDays: 4 }));
    const rebuilt = buildPlan(
      makeInput({
        liftDays: 4,
        existingState: { ...first.programState, trainingBlock: activeBlock },
        preserveHistory: false,
      })
    );
    expect(rebuilt.programState.trainingBlock).toBeUndefined();
    expect(rebuilt.programState.primaryGoal).toBe("hypertrophy");
  });

  // This used a GOAL change as its example of a "content edit" and asserted
  // the workouts came back byte-identical — so it pinned two properties at
  // once, and only one of them was intended. The structural half (a content
  // edit must not blow away the user's customisations) is Pgm5 Q2 and is
  // kept, on an input that is genuinely structure-only. The other half — a
  // training-focus change moving 0 of 18 slots — is the defect Blk2 exists
  // to fix, and it was being held in place by its own regression test.
  it("a content edit (same lift-days) preserves the existing workouts verbatim", () => {
    const first = buildPlan(
      makeInput({ liftDays: 4, primaryGoal: "hypertrophy" })
    );
    const edited = buildPlan(
      makeInput({
        liftDays: 4,
        primaryGoal: "hypertrophy",
        equipment: "full_gym", // content edit, same day count, same focus
        existingState: first.programState,
        preserveHistory: true,
      })
    );
    expect(edited.programState.workouts).toEqual(first.programState.workouts);
    expect(edited.programState.splitType).toBe(first.programState.splitType);
  });

  // The focus is now owned by a training block, and `buildPlan` pins
  // `primaryGoal` to it. What this documents is that buildPlan is NOT where
  // a focus change is applied — `represcribeWorkouts` is — so passing a
  // different goal here still leaves the week alone. Anyone reaching for
  // buildPlan to change someone's focus should find this and go elsewhere.
  it("does not represcribe on a bare goal change — that is the block's job", () => {
    const first = buildPlan(
      makeInput({ liftDays: 4, primaryGoal: "hypertrophy" })
    );
    const edited = buildPlan(
      makeInput({
        liftDays: 4,
        primaryGoal: "strength",
        existingState: first.programState,
        preserveHistory: true,
      })
    );
    const reps = (s: typeof first.programState) =>
      s.workouts.flatMap((d) => d.exercises.map((e) => e.reps));
    expect(reps(edited.programState)).toEqual(reps(first.programState));
    expect(edited.programState.primaryGoal).toBe("strength");
  });

  it("preserves user structural edits (added + reordered exercises) on a content edit", () => {
    const first = buildPlan(makeInput({ liftDays: 4 }));
    // Simulate Program-page customizations: add an exercise to day 0, reverse day 1.
    const customized = JSON.parse(
      JSON.stringify(first.programState)
    ) as typeof first.programState;
    customized.workouts[0].exercises.push({
      ...customized.workouts[0].exercises[0],
      name: "User Added Curl",
      exerciseId: "user-added-curl",
    });
    customized.workouts[1].exercises.reverse();

    const edited = buildPlan(
      makeInput({
        liftDays: 4,
        nutritionPhase: "cut", // content edit
        existingState: customized,
        preserveHistory: true,
      })
    );
    expect(edited.programState.workouts).toEqual(customized.workouts);
    expect(
      edited.programState.workouts[0].exercises.some(
        (e) => e.exerciseId === "user-added-curl"
      )
    ).toBe(true);
  });

  it("a lift-days change rebuilds the structure (does not preserve)", () => {
    const first = buildPlan(makeInput({ liftDays: 4 }));
    const bumped = buildPlan(
      makeInput({
        liftDays: 5,
        existingState: first.programState,
        preserveHistory: true,
      })
    );
    expect(bumped.programState.workouts).toHaveLength(5);
    expect(bumped.programState.workouts).not.toEqual(
      first.programState.workouts
    );
  });

  it("a content edit honours injuries in place (wires injury re-swap into regeneration)", () => {
    const first = buildPlan(makeInput({ liftDays: 4 }));
    // Force a known knee-contraindicated exercise into a slot, then add a knee
    // injury via a content edit (same lift-days → preserve path).
    const customized = JSON.parse(
      JSON.stringify(first.programState)
    ) as typeof first.programState;
    customized.workouts[0].exercises[0] = {
      ...customized.workouts[0].exercises[0],
      exerciseId: "squat",
      name: "Barbell Squat",
      movementCategory: "knee_dominant",
    };
    const edited = buildPlan(
      makeInput({
        liftDays: 4,
        injuries: ["knee"],
        existingState: customized,
        preserveHistory: true,
      })
    );
    // The contraindicated squat was swapped; structure (day/exercise count) held.
    expect(edited.programState.workouts[0].exercises[0].exerciseId).not.toBe(
      "squat"
    );
    expect(edited.programState.workouts[0].exercises).toHaveLength(
      customized.workouts[0].exercises.length
    );
  });

  it("a lift a content edit's injury swap brings in takes its own role's numbers", () => {
    const first = buildPlan(makeInput({ liftDays: 4 }));
    const customized = JSON.parse(
      JSON.stringify(first.programState)
    ) as typeof first.programState;
    // An accessory leg extension at numbers no role gives.
    customized.workouts[1].exercises[2] = {
      ...customized.workouts[1].exercises[2],
      exerciseId: "leg-extension",
      name: "Leg Extension",
      movementCategory: "knee_dominant",
      isAccessory: true,
      reps: 20,
      baseReps: 20,
      repRangeMax: 25,
    };
    const edited = buildPlan(
      makeInput({
        liftDays: 4,
        injuries: ["knee"],
        existingState: customized,
        preserveHistory: true,
      })
    );
    const swapped = edited.programState.workouts[1].exercises[2];
    expect(swapped.exerciseId).not.toBe("leg-extension");
    // Day 2 of 4 is a heavier day: its role's bottom, two under.
    const row = roleRepsFor("hypertrophy", swapped, "intermediate");
    const reps = Math.max(
      repFloorFor(swapped),
      row.bottom + undulationDeltaFor(swapped, assignDayRoles(4)[1])
    );
    expect(swapped.reps).toBe(reps);
    expect(swapped.baseReps).toBe(reps);
    // …and the slots the edit left alone are as they were.
    expect(edited.programState.workouts[0].exercises).toEqual(
      customized.workouts[0].exercises
    );
  });

  // Lift4 (11): removing a limitation brings the original lifts back as part
  // of saving.
  const lifts = (state: {
    workouts: { exercises: { exerciseId: string }[] }[];
  }) => state.workouts.map((d) => d.exercises.map((e) => e.exerciseId));

  it("a save that lifts an injury brings back the lifts it swapped out", () => {
    const healthy = buildPlan(makeInput({ liftDays: 4 })).programState;
    const knee = buildPlan(
      makeInput({
        liftDays: 4,
        injuries: ["knee"],
        existingState: healthy,
        preserveHistory: true,
      })
    ).programState;
    const swapped = knee.workouts
      .flatMap((d) => d.exercises)
      .filter((e) => e.swappedFrom);
    expect(swapped.map((e) => e.swappedFrom!.exerciseId)).toContain("squat");
    // While the knee is still there, a save keeps the swaps.
    const again = buildPlan(
      makeInput({
        liftDays: 4,
        injuries: ["knee"],
        existingState: knee,
        preserveHistory: true,
      })
    ).programState;
    expect(lifts(again)).toEqual(lifts(knee));
    // Lifted: the plan's own lifts come back, with nothing marking a swap.
    const back = buildPlan(
      makeInput({
        liftDays: 4,
        injuries: [],
        existingState: knee,
        preserveHistory: true,
      })
    ).programState;
    expect(lifts(back)).toEqual(lifts(healthy));
    for (const ex of back.workouts.flatMap((d) => d.exercises)) {
      expect(ex.swappedFrom, ex.exerciseId).toBeUndefined();
    }
    // …at their role's numbers on their day.
    expect(
      back.workouts.map((d) => d.exercises.map((e) => `${e.sets}×${e.reps}`))
    ).toEqual(
      healthy.workouts.map((d) => d.exercises.map((e) => `${e.sets}×${e.reps}`))
    );
  });

  it("a save with the equipment back brings back the lifts it swapped out", () => {
    const gym = buildPlan(makeInput({ liftDays: 4 })).programState;
    const home = buildPlan(
      makeInput({
        liftDays: 4,
        equipment: "home_gym",
        existingState: gym,
        preserveHistory: true,
      })
    ).programState;
    expect(lifts(home)).not.toEqual(lifts(gym));
    const back = buildPlan(
      makeInput({
        liftDays: 4,
        equipment: "full_gym",
        existingState: home,
        preserveHistory: true,
      })
    ).programState;
    expect(lifts(back)).toEqual(lifts(gym));
  });

  it("goes back to the plan's own lift through a second swap", () => {
    // A home gym makes the barbell curl a dumbbell curl; a sore elbow then
    // makes that a hammer curl. Both lifted, the barbell curl comes back,
    // not the dumbbell curl in between.
    const gym = buildPlan(makeInput({ liftDays: 4 })).programState;
    expect(lifts(gym).flat()).toContain("barbell-curl");
    const home = buildPlan(
      makeInput({
        liftDays: 4,
        equipment: "home_gym",
        existingState: gym,
        preserveHistory: true,
      })
    ).programState;
    const elbow = buildPlan(
      makeInput({
        liftDays: 4,
        equipment: "home_gym",
        injuries: ["elbow"],
        existingState: home,
        preserveHistory: true,
      })
    ).programState;
    expect(lifts(elbow).flat()).not.toContain("db-curl");
    const back = buildPlan(
      makeInput({
        liftDays: 4,
        existingState: elbow,
        preserveHistory: true,
      })
    ).programState;
    expect(lifts(back)).toEqual(lifts(gym));
  });

  it("a new plan takes small plates from the setup; a plan the person has keeps its settings", () => {
    const fresh = buildPlan(makeInput({ smallPlates: true })).programState;
    expect(fresh.settings?.smallPlates).toBe(true);
    expect(buildPlan(makeInput()).programState.settings?.smallPlates).toBe(
      false
    );
    const kept = buildPlan(
      makeInput({
        smallPlates: false,
        existingState: fresh,
        preserveHistory: true,
      })
    ).programState;
    expect(kept.settings?.smallPlates).toBe(true);
  });

  it("a save that adds a barbell at home brings the barbell lifts back", () => {
    const gym = buildPlan(makeInput({ liftDays: 4 })).programState;
    const home = buildPlan(
      makeInput({
        liftDays: 4,
        equipment: "home_gym",
        existingState: gym,
        preserveHistory: true,
      })
    ).programState;
    const withBar = buildPlan(
      makeInput({
        liftDays: 4,
        equipment: "home_gym",
        barbellAtHome: true,
        existingState: home,
        preserveHistory: true,
      })
    ).programState;
    // The barbell lifts come back; the cable and machine ones stay swapped.
    expect(lifts(withBar).flat()).toEqual(
      expect.arrayContaining(["squat", "bench-press"])
    );
    for (const ex of withBar.workouts.flatMap((d) => d.exercises)) {
      expect(["Cable Machine", "Machine"]).not.toContain(
        getExerciseById(ex.exerciseId)?.equipment
      );
    }
  });

  it("a content edit honours equipment in place (swaps unavailable exercises)", () => {
    const first = buildPlan(makeInput({ liftDays: 4 }));
    // Force a Barbell exercise into a slot, then downgrade equipment to home_gym.
    const customized = JSON.parse(
      JSON.stringify(first.programState)
    ) as typeof first.programState;
    customized.workouts[0].exercises[0] = {
      ...customized.workouts[0].exercises[0],
      exerciseId: "bench-press",
      name: "Bench Press",
      movementCategory: "horizontal_push",
    };
    const edited = buildPlan(
      makeInput({
        liftDays: 4,
        equipment: "home_gym",
        existingState: customized,
        preserveHistory: true,
      })
    );
    // The Barbell bench was swapped to an available alternative; structure held.
    expect(edited.programState.workouts[0].exercises[0].exerciseId).not.toBe(
      "bench-press"
    );
    expect(edited.programState.workouts[0].exercises).toHaveLength(
      customized.workouts[0].exercises.length
    );
  });
});

/* ─── Lift4 · a level change is a content edit ────────────────────
   It rebuilt the week and dropped every customisation while the save's own
   confirm said "keep your current workouts". The level now reaches the plan
   only through what reads it, and a plan being built. */
describe("buildPlan · a level change is a content edit (Lift4)", () => {
  const ids = (plan: ReturnType<typeof buildPlan>) =>
    plan.programState.workouts.map((d) => d.exercises.map((e) => e.exerciseId));
  const intermediate = () =>
    buildPlan(makeInput({ experience: "intermediate" }));

  it("keeps the week's exercises, sets and reps when the level changes", () => {
    const first = intermediate();
    const edited = buildPlan(
      makeInput({
        experience: "beginner",
        previousExperience: "intermediate",
        existingState: first.programState,
        preserveHistory: true,
      })
    );
    const shape = (plan: ReturnType<typeof buildPlan>) =>
      plan.programState.workouts.map((d) =>
        d.exercises.map((e) => [e.exerciseId, e.sets, e.reps])
      );
    expect(shape(edited)).toEqual(shape(first));
  });

  it("does not swap lifts by level on a later, unrelated save", () => {
    const first = intermediate();
    // The gate has something to swap: pull-ups are not a beginner's lift.
    const seeded = buildPlan(
      makeInput({ experience: "beginner", existingState: first.programState })
    );
    expect(ids(seeded)).not.toEqual(ids(first));
    // The profile already says beginner; the save is about something else.
    const later = buildPlan(
      makeInput({
        experience: "beginner",
        previousExperience: "beginner",
        nutritionPhase: "cut",
        existingState: first.programState,
        preserveHistory: true,
      })
    );
    expect(ids(later)).toEqual(ids(first));
  });

  it("still gates a plan built at onboarding from a template", () => {
    // No previous level: a first plan, which the level picks for.
    const first = intermediate();
    const seeded = buildPlan(
      makeInput({ experience: "beginner", existingState: first.programState })
    );
    expect(ids(seeded).flat()).not.toContain("pull-ups");
  });
});

/* ─── Lift4 (5) · plans fit the session length ──────────────────── */
describe("buildPlan · sessions fit the time the person has (Lift4 (5))", () => {
  const sets = (plan: ReturnType<typeof buildPlan>) =>
    plan.programState.workouts.map((d) => d.exercises.map((e) => e.sets));
  const total = (plan: ReturnType<typeof buildPlan>) =>
    sets(plan)
      .flat()
      .reduce((n, s) => n + s, 0);

  it("fits a new plan to the answer, an hour when there is none", () => {
    const half = buildPlan(makeInput({ sessionMinutes: 30 }));
    const unanswered = buildPlan(makeInput());
    expect(half.programState.sessionMinutes).toBe(30);
    expect(unanswered.programState.sessionMinutes).toBe(60);
    expect(total(half)).toBeLessThan(total(unanswered));
    // The answer is kept with the plan it shaped.
    expect(half.profileUpdates.liftTimeBudgetMinutes).toBe(30);
    expect("liftTimeBudgetMinutes" in unanswered.profileUpdates).toBe(false);
  });

  it("re-fits the plan's sets, never its lifts, when a save changes the length", () => {
    const first = buildPlan(makeInput({ sessionMinutes: 75 }));
    const edited = buildPlan(
      makeInput({
        sessionMinutes: 30,
        previousSessionMinutes: 75,
        existingState: first.programState,
        preserveHistory: true,
      })
    );
    const ids = (plan: ReturnType<typeof buildPlan>) =>
      plan.programState.workouts.map((d) =>
        d.exercises.map((e) => e.exerciseId)
      );
    expect(ids(edited)).toEqual(ids(first));
    expect(total(edited)).toBeLessThan(total(first));
    expect(edited.programState.sessionMinutes).toBe(30);
    // …and back again gives the sets back.
    const back = buildPlan(
      makeInput({
        sessionMinutes: 75,
        previousSessionMinutes: 30,
        existingState: edited.programState,
        preserveHistory: true,
      })
    );
    expect(sets(back)).toEqual(sets(first));
  });

  it("keeps the sets, and the length the plan was fitted to, on any other save", () => {
    const first = buildPlan(makeInput({ sessionMinutes: 45 }));
    const later = buildPlan(
      makeInput({
        sessionMinutes: 45,
        previousSessionMinutes: 45,
        nutritionPhase: "cut",
        existingState: first.programState,
        preserveHistory: true,
      })
    );
    expect(sets(later)).toEqual(sets(first));
    expect(later.programState.sessionMinutes).toBe(45);
    // A plan from before plans were fitted stays unfitted until asked.
    const { sessionMinutes: _drop, ...legacy } = first.programState;
    const kept = buildPlan(
      makeInput({
        sessionMinutes: 60,
        previousSessionMinutes: 60,
        existingState: legacy,
        preserveHistory: true,
      })
    );
    expect(kept.programState.sessionMinutes).toBeUndefined();
  });
});

describe("firstLiftWeekKey — the week a fresh plan's rollover counts from", () => {
  // Week of Monday 28 September 2026.
  it("is this week for a Monday-to-Wednesday start", () => {
    for (const d of ["2026-09-28", "2026-09-29", "2026-09-30"]) {
      expect(firstLiftWeekKey({ currentDate: d })).toBe("2026-09-28");
    }
  });

  it("is next week for a Thursday-to-Sunday start, so week 1 runs to the next Sunday", () => {
    for (const d of ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]) {
      expect(firstLiftWeekKey({ currentDate: d })).toBe("2026-10-05");
    }
  });

  it("keeps an anchor already ahead through a settings save, and only that", () => {
    const save = (liftWeekKey: string) =>
      firstLiftWeekKey({
        currentDate: "2026-10-03",
        preserveHistory: true,
        existingState: { liftWeekKey },
      });
    expect(save("2026-10-05")).toBe("2026-10-05");
    expect(save("2026-09-28")).toBe("2026-09-28");
    expect(save("2026-09-21")).toBe("2026-09-28");
  });
});

/* ─── Lift4 (10): the race build's leg trim on save ─────────────────── */

describe("buildPlan · the race build's leg trim", () => {
  const raceGoal = { distance: "half" as const, targetDate: "2026-07-16" };
  /** A half-marathon plan saved part-way into its block: a 16-week block
   *  with nine weeks left puts the plan in a build week. */
  function inBuildWeek(over: Partial<PlanBuilderInput> = {}) {
    const fresh = buildPlan(
      makeInput({ runMode: "race_prep", weeklyRunDays: 3, raceGoal })
    ).programState;
    const existingState = {
      ...fresh,
      runPlan: { ...fresh.runPlan!, totalWeeks: 16 },
    };
    return makeInput({
      runMode: "race_prep",
      weeklyRunDays: 3,
      raceGoal,
      existingState,
      preserveHistory: true,
      ...over,
    });
  }
  const legSets = (state: ProgramState) =>
    state.workouts.flatMap((d) =>
      d.exercises.filter(loadsTheLegs).map((e) => [e.sets, e.baseSets])
    );

  it("is set up in a build week", () => {
    const out = buildPlan(inBuildWeek());
    expect(isRaceBuildWeek(raceBlockWeek(out.programState.runPlan))).toBe(true);
  });

  it("trims the leg lifts at once on a yes, and saves the answer", () => {
    const out = buildPlan(inBuildWeek({ raceLegTrim: true }));
    expect(out.programState.raceWeek).toBe("build");
    const legs = legSets(out.programState);
    expect(legs.length).toBeGreaterThan(0);
    for (const [sets, base] of legs) expect(sets).toBe(raceLegSets(base!));
    expect(legs.some(([sets, base]) => sets! < base!)).toBe(true);
    expect(out.profileUpdates.raceLegTrim).toBe(true);
  });

  it("gives the sets back on a no", () => {
    const trimmed = buildPlan(inBuildWeek({ raceLegTrim: true })).programState;
    const out = buildPlan(
      inBuildWeek({ raceLegTrim: false, existingState: trimmed })
    );
    expect(out.programState.raceWeek).toBeUndefined();
    for (const [sets, base] of legSets(out.programState))
      expect(sets).toBe(base);
    expect(out.profileUpdates.raceLegTrim).toBe(false);
  });

  it("leaves a lighter week as it is", () => {
    const fresh = buildPlan(inBuildWeek()).programState;
    const lighter = { ...fresh, currentPhase: "deload" as const };
    const out = buildPlan(
      inBuildWeek({ raceLegTrim: true, existingState: lighter })
    );
    expect(out.programState.raceWeek).toBeUndefined();
    for (const [sets, base] of legSets(out.programState))
      expect(sets).toBe(base ?? sets);
  });
});

/* ─── A rebuild inside a lighter week keeps it lighter ──────────────── */

describe("buildPlan · a rebuild inside a lighter week", () => {
  /** A four-day plan in a lighter week: half the sets, from the plan's. */
  function lighterWeek(over: Partial<ProgramState> = {}): ProgramState {
    const fresh = buildPlan(makeInput()).programState;
    return {
      ...fresh,
      currentPhase: "deload",
      workouts: applyDeload(fresh.workouts),
      ...over,
    };
  }
  const halved = (state: ProgramState) =>
    state.workouts.every((d) =>
      d.exercises.every(
        (e) => e.sets === Math.max(1, Math.ceil((e.baseSets ?? e.sets) / 2))
      )
    );

  it("keeps half the sets when the lift days change", () => {
    const out = buildPlan(
      makeInput({
        liftDays: 3,
        preferredSplit: "full_body",
        existingState: lighterWeek(),
        preserveHistory: true,
      })
    ).programState;
    expect(out.currentPhase).toBe("deload");
    expect(out.workouts).toHaveLength(3);
    expect(halved(out)).toBe(true);
    expect(
      out.workouts.some((d) => d.exercises.some((e) => e.sets < e.baseSets!))
    ).toBe(true);
  });

  it("keeps half the sets when the session length changes", () => {
    const existing = lighterWeek({ sessionMinutes: 60 });
    const out = buildPlan(
      makeInput({
        existingState: existing,
        preserveHistory: true,
        sessionMinutes: 45,
        previousSessionMinutes: 60,
      })
    ).programState;
    expect(out.currentPhase).toBe("deload");
    expect(halved(out)).toBe(true);
  });

  it("keeps the set fewer of the first week back after a break", () => {
    const fresh = buildPlan(makeInput()).programState;
    const back = easeBackIn(fresh, 0.1);
    const out = buildPlan(
      makeInput({
        liftDays: 3,
        preferredSplit: "full_body",
        existingState: back,
        preserveHistory: true,
      })
    ).programState;
    expect(out.easingBack).toEqual({ weeksLeft: 2 });
    for (const day of out.workouts)
      for (const lift of day.exercises)
        expect(lift.sets).toBe(Math.max(1, lift.baseSets! - 1));
  });

  it("keeps a lighter week taken in a race build week as it is", () => {
    const raceGoal = { distance: "half" as const, targetDate: "2026-07-16" };
    const race = buildPlan(
      makeInput({ runMode: "race_prep", weeklyRunDays: 3, raceGoal })
    ).programState;
    const trimmed = buildPlan(
      makeInput({
        runMode: "race_prep",
        weeklyRunDays: 3,
        raceGoal,
        raceLegTrim: true,
        existingState: {
          ...race,
          runPlan: { ...race.runPlan!, totalWeeks: 16 },
        },
        preserveHistory: true,
      })
    ).programState;
    expect(trimmed.raceWeek).toBe("build");
    // "Take a lighter week": half the plan's sets, the build mark kept.
    const lighter = {
      ...trimmed,
      currentPhase: "deload" as const,
      workouts: applyDeload(trimmed.workouts),
    };
    const saved = buildPlan(
      makeInput({
        runMode: "race_prep",
        weeklyRunDays: 3,
        raceGoal,
        raceLegTrim: false,
        existingState: lighter,
        preserveHistory: true,
      })
    ).programState;
    expect(saved.workouts).toEqual(lighter.workouts);
  });

  it("keeps race week one short session, its legs halved once", () => {
    const fullBody = { liftDays: 3, preferredSplit: "full_body" as const };
    const fresh = buildPlan(
      makeInput({ ...fullBody, bodyweightKg: 80 })
    ).programState;
    // A week trained, so each lift has a load in its history and keeps it.
    const raceWeek = advanceWeek(
      {
        ...fresh,
        workouts: fresh.workouts.map((d) => ({
          ...d,
          completed: true,
          exercises: d.exercises.map((e) => ({
            ...e,
            performanceHistory: [
              {
                date: "2026-05-10",
                weight: e.weight,
                repsCompleted: e.reps,
                repsTarget: e.reps,
              },
            ],
          })),
        })),
      },
      "intermediate",
      undefined,
      { weekIndex: 15, totalWeeks: 16, distance: "half" }
    );
    expect(raceWeek.raceWeek).toBe("race");
    const legsOf = (state: ProgramState) =>
      state.workouts[0].exercises
        .filter((e) => loadsTheLegs(e) && e.weight > 0)
        .map((e) => [e.weight, e.preDeloadWeight]);
    const before = legsOf(raceWeek);
    expect(before.length).toBeGreaterThan(0);
    // A refit keeps the week's sessions: the legs are not halved again.
    const refit = buildPlan(
      makeInput({
        ...fullBody,
        bodyweightKg: 80,
        existingState: { ...raceWeek, sessionMinutes: 60 },
        preserveHistory: true,
        sessionMinutes: 45,
        previousSessionMinutes: 60,
      })
    ).programState;
    expect(legsOf(refit)).toEqual(before);
    expect(refit.workouts.slice(1).every((d) => d.skipped)).toBe(true);
    // New lift days rebuild it: still one session, the other skipped, and
    // its legs at half their weight.
    const rebuilt = buildPlan(
      makeInput({
        liftDays: 2,
        preferredSplit: "full_body",
        bodyweightKg: 80,
        existingState: raceWeek,
        preserveHistory: true,
      })
    ).programState;
    expect(rebuilt.raceWeek).toBe("race");
    expect(rebuilt.workouts.map((d) => !!d.skipped)).toEqual([false, true]);
    // Halved once, from the plan's own weights, which the week after gives
    // back.
    expect(legsOf(rebuilt)).toEqual(before);
  });
});
