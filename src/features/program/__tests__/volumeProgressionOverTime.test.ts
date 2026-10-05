/**
 * What happens to a compliant lifter's SET volume over six mesocycles.
 *
 *   week   total  main  accessory   currentPhase
 *      5      66    24         42   progression
 *      6      66    24         42   progression
 *      7      66    24         42   progression
 *      8      44    16         28   deload
 *
 * …and then those same four numbers again, unchanged, through week 24. A
 * lifter who trains every session and hits every target has EXACTLY the set
 * count in week 24 that they had in week 4.
 *
 * That is the design (Lift4 (5), (13)): the days and the session length set
 * a plan's volume, nothing at the weekly rollover adds or removes sets, and
 * load is the progression axis. Volume-ramp programming (MEV → MAV → MRV
 * across a block) would add sets every week to exactly the lifter this file
 * simulates; Tropos progresses that lifter by load instead, which the same
 * simulation shows working: an accessory climbs over fifteen weeks with its
 * identity, history and anchor intact (a barbell curl from the empty bar,
 * since the simulated plan has no bodyweight; its isolation range is five
 * reps wide and its steps 1.25 kg, with the small plates the simulation
 * turns on).
 *
 * The periodicity is also a load-bearing invariant that no single-pass test
 * can hold: the weekly reset, the recovery session and the deload's
 * re-anchoring must leave no residue in `baseSets`. A drift of one set per
 * cycle would be invisible week-to-week and obvious here, which is the
 * failure an earlier deload shipped (permanent decay, repaired by
 * `repairDeloadDecay`).
 *
 * One thing checked and found benign, recorded so nobody re-chases it: TONNAGE
 * is not monotonic across like-for-like weeks. That is double progression
 * resetting the rep target to `baseReps` on a load step, so a week can carry
 * heavier weight at fewer reps; accessory ids stay stable and loads climb
 * monotonically across all six cycles.
 */
import { describe, it, expect } from "vitest";
import {
  generateProgram,
  advanceWeek,
  applyProgression,
} from "@/features/program/programEngine";
import type {
  ProgramExercise,
  ProgramState,
  WorkoutDay,
} from "@/features/program/programTypes";

const setsIn = (ws: WorkoutDay[], pick: (e: ProgramExercise) => boolean) =>
  ws.reduce(
    (s, d) =>
      s + d.exercises.reduce((t, e) => t + (pick(e) ? (e.sets ?? 0) : 0), 0),
    0
  );
const total = (ws: WorkoutDay[]) => setsIn(ws, () => true);
const accessory = (ws: WorkoutDay[]) =>
  setsIn(ws, (e) => e.isAccessory === true);
const main = (ws: WorkoutDay[]) => setsIn(ws, (e) => e.isAccessory !== true);

interface WeekRow {
  week: number;
  total: number;
  main: number;
  accessory: number;
  phase: string;
  accessories: { id: string; weight: number; reps: number }[];
}

/** Six mesocycles of a lifter who trains every day and hits every target. */
function simulate(weeks: number): WeekRow[] {
  const { workouts, splitType } = generateProgram(
    "recomp",
    4,
    undefined,
    "hypertrophy",
    undefined,
    undefined,
    "intermediate"
  );
  let state: ProgramState = {
    goal: "recomp",
    currentPhase: "accumulation",
    weekNumber: 1,
    splitType,
    workouts,
    fatigueScore: 0,
    updatedAt: 0,
    runDays: [],
  } as unknown as ProgramState;

  const rows: WeekRow[] = [];
  for (let i = 0; i < weeks; i++) {
    const trained: WorkoutDay[] = state.workouts.map((d) => ({
      ...d,
      completed: true,
      exercises: d.exercises.map((e) =>
        // Exactly the prescription, at the prescribed load, no RPE flag.
        applyProgression(e, e.reps, e.weight, true)
      ),
    }));
    state = { ...state, workouts: trained };
    rows.push({
      week: state.weekNumber,
      total: total(state.workouts),
      main: main(state.workouts),
      accessory: accessory(state.workouts),
      phase: state.currentPhase,
      accessories: state.workouts
        .flatMap((d) => d.exercises)
        .filter((e) => e.isAccessory === true)
        .map((e) => ({
          id: e.exerciseId ?? "",
          weight: e.weight,
          reps: e.reps,
        })),
    });
    state = advanceWeek(state, "intermediate");
  }
  return rows;
}

const ROWS = simulate(24);
const at = (week: number) => ROWS.find((r) => r.week === week)!;

describe("weekly set volume over six mesocycles", () => {
  it("repeats the same four numbers for twenty-four weeks", () => {
    /* The steady-state cycle: three weeks at the plan's own sets, then the
       lighter week. Every cycle after the first starts from the anchor. */
    const cycle = (start: number) =>
      [0, 1, 2, 3].map((i) => at(start + i).total);
    expect(cycle(5)).toEqual([66, 66, 66, 44]);
    for (const start of [9, 13, 17, 21]) {
      expect(cycle(start), `mesocycle starting at week ${start}`).toEqual(
        cycle(5)
      );
    }
  });

  it("mains hold their set count in every trained week", () => {
    const nonDeload = ROWS.filter((r) => r.phase !== "deload");
    expect(new Set(nonDeload.map((r) => r.main))).toEqual(new Set([24]));
    // The deload is the only thing that moves them, and it moves them back.
    expect(
      new Set(ROWS.filter((r) => r.phase === "deload").map((r) => r.main))
    ).toEqual(new Set([16]));
  });

  it("leaves no residue in the anchor — week 24 equals week 4", () => {
    /* The invariant the anchor-derived recompute exists to provide, stated
       across the whole span rather than one transition. A one-set-per-cycle
       drift is invisible week-to-week and unmissable here; permanent decay of
       exactly this shape shipped once already (repairDeloadDecay). */
    expect(at(24).total).toBe(at(4).total);
    expect(at(24).accessory).toBe(at(4).accessory);
    expect(at(23).total).toBe(at(3).total);
  });
});

describe("why it is flat — load carries the progression", () => {
  it("and load carries the progression instead", () => {
    /* The other half of the design, so "volume is flat" is never read on its
       own as "nothing progresses". Same exercise, same slot, fifteen weeks. */
    const first = at(3).accessories[0];
    const later = at(18).accessories[0];
    expect(later.id).toBe(first.id); // identity intact — no rotation loss
    expect(later.weight).toBeGreaterThan(first.weight);
    expect(later.weight / first.weight).toBeGreaterThanOrEqual(1.12);

    // Every accessory, not just the first, moved on and none went backwards:
    // by load, or by reps where the next weight is more than about 15%
    // heavier and waits for the person to pick it up (`loadSteps.ts`).
    for (let i = 0; i < at(3).accessories.length; i++) {
      const before = at(3).accessories[i];
      const after = at(18).accessories[i];
      expect(after.weight, `${before.id} lost load`).toBeGreaterThanOrEqual(
        before.weight
      );
      expect(
        after.weight > before.weight || after.reps > before.reps,
        `${before.id} stood still`
      ).toBe(true);
    }
  });
});
