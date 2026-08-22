/**
 * What happens to a compliant lifter's SET volume over six mesocycles.
 *
 * Individual passes are documented: `applyWeeklyVolumeShape` says mains hold
 * at `baseSets` and accessories run base−1 / base / base+1 across the meso;
 * `applyAdjustment` says `add_volume` raises the accessory anchor. What was
 * never written down is what those compose to over TIME, and that turns out
 * to be the more useful statement:
 *
 *   week   total  main  accessory   currentPhase
 *      5      60    31         29   progression
 *      6      71    31         40   progression
 *      7      84    31         53   progression
 *      8      52    23         29   deload
 *
 * …and then those same four numbers again, unchanged, through week 24. A
 * lifter who trains every session and hits every target has EXACTLY the set
 * count in week 24 that they had in week 4.
 *
 * That is not a defect, and this file changes nothing. It is the direct
 * consequence of a deliberate design: **load is the progression axis, volume
 * is the troubleshooting axis.** `resolveAdjustment` only ever returns
 * `add_volume` for a lifter who is BOTH plateaued (≥2 backed-off lifts) and
 * recovered — it implements Helms's adjustment flowchart, which is a response
 * to a stall, not a planned ramp. A lifter who never stalls never triggers it,
 * so the volume lever exists and is never pulled for them.
 *
 * Worth having explicitly, for two reasons.
 *
 * The first is that it is a real fork in the training literature and the
 * codebase now states which side it is on. Volume-ramp programming (MEV → MAV
 * → MRV across a block) would add sets every week to exactly the lifter this
 * file simulates. Tropos does not, and progresses that lifter by load instead
 * — which the same simulation shows working: an accessory climbs 12 → 15.75 kg
 * over fifteen weeks with its identity, history and anchor intact.
 *
 * The second is that the periodicity is a genuinely load-bearing invariant
 * that no single-pass test can hold. It is produced by four passes composed in
 * order (`applyWeeklyVolumeShape` → `applyFatigue` → `applyAdjustment` →
 * `applyRecoverySession`) plus the deload's `prepareForDeload` re-anchoring,
 * and the whole point of the anchor-derived recompute is that none of them may
 * leave residue in `baseSets`. A drift of one set per cycle would be invisible
 * week-to-week and obvious here — which is the failure the pre-2026-07-28
 * deload actually shipped (permanent decay, repaired by `repairDeloadDecay`).
 *
 * One thing checked and found benign, recorded so nobody re-chases it: TONNAGE
 * is not monotonic across like-for-like weeks (36,086 at week 3 vs 33,438 at
 * week 7 — same sets, more load). That is double progression resetting the rep
 * target to `baseReps` on a load step, so a week can carry heavier weight at
 * fewer reps. Accessory identity and load were traced across all six cycles to
 * rule out the alternative explanation (rotation discarding progression): ids
 * are stable and loads climb monotonically.
 */
import { describe, it, expect } from "vitest";
import {
  generateProgram,
  advanceWeek,
  applyProgression,
} from "@/features/program/programEngine";
import { resolveAdjustment } from "@/features/program/adjustmentRule";
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
  accessories: { id: string; weight: number }[];
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
        applyProgression(e, e.reps, e.weight, "recomp", true)
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
        .map((e) => ({ id: e.exerciseId ?? "", weight: e.weight })),
    });
    // "recovered" is the most favourable read available — the one that would
    // let `add_volume` fire if anything else qualified it.
    state = advanceWeek(state, "intermediate", "recovered");
  }
  return rows;
}

const ROWS = simulate(24);
const at = (week: number) => ROWS.find((r) => r.week === week)!;

describe("weekly set volume over six mesocycles", () => {
  it("repeats the same four numbers for twenty-four weeks", () => {
    /* The steady-state cycle. Week 1 is excluded because it is the freshly
       generated plan, which has not been through `applyWeeklyVolumeShape`
       yet — every cycle after it starts from the anchor. */
    const cycle = (start: number) =>
      [0, 1, 2, 3].map((i) => at(start + i).total);
    expect(cycle(5)).toEqual([60, 71, 84, 52]);
    for (const start of [9, 13, 17, 21]) {
      expect(cycle(start), `mesocycle starting at week ${start}`).toEqual(
        cycle(5)
      );
    }
  });

  it("mains hold their set count in every trained week", () => {
    const nonDeload = ROWS.filter((r) => r.phase !== "deload");
    expect(new Set(nonDeload.map((r) => r.main))).toEqual(new Set([31]));
    // The deload is the only thing that moves them, and it moves them back.
    expect(
      new Set(ROWS.filter((r) => r.phase === "deload").map((r) => r.main))
    ).toEqual(new Set([23]));
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

describe("why it is flat — volume is the troubleshooting lever, not the ramp", () => {
  it("add_volume cannot fire for a lifter who never stalls", () => {
    /* Stated against the rule itself, so the reason is pinned and not just the
       symptom: `add_volume` needs BOTH a programme-level stall and a recovered
       read. The simulated lifter completes every set, so `plateauCount` is
       reset on every exercise every session and the first condition is never
       met — no matter how recovered they are. */
    expect(
      resolveAdjustment({
        plateauedExercises: 0,
        recovery: "recovered",
        priorReductions: 0,
      })
    ).toBe("hold");
    expect(
      resolveAdjustment({
        plateauedExercises: 1,
        recovery: "recovered",
        priorReductions: 0,
      })
    ).toBe("hold");
    // It is reachable — just only from a stall.
    expect(
      resolveAdjustment({
        plateauedExercises: 2,
        recovery: "recovered",
        priorReductions: 0,
      })
    ).toBe("add_volume");
  });

  it("and load carries the progression instead", () => {
    /* The other half of the design, so "volume is flat" is never read on its
       own as "nothing progresses". Same exercise, same slot, fifteen weeks. */
    const first = at(3).accessories[0];
    const later = at(18).accessories[0];
    expect(later.id).toBe(first.id); // identity intact — no rotation loss
    expect(later.weight).toBeGreaterThan(first.weight);
    expect(later.weight / first.weight).toBeGreaterThan(1.25);

    // Every accessory, not just the first: none of them went backwards.
    for (let i = 0; i < at(3).accessories.length; i++) {
      expect(
        at(18).accessories[i].weight,
        `accessory ${at(3).accessories[i].id} lost load`
      ).toBeGreaterThan(at(3).accessories[i].weight);
    }
  });
});
