/**
 * A7 — race-day plan view model.
 *
 * Load-bearing pins: split-table CONSERVATION (the negative-split bias
 * shapes the race but the rows must sum exactly to the plan time), the
 * long-shot pacing source (same judgment as the training gate, verdict
 * used as the independent oracle), and the phase gate (execution cards
 * belong to taper + race week only).
 */
import { describe, it, expect } from "vitest";
import {
  buildRaceDayPlan,
  raceDayPlanVisible,
  raceTimeLabel,
} from "../raceDayPlan";
import { predictedRaceTimesFromFitness } from "../runPaces";
import { raceTargetVerdict } from "../raceGoalPlanner";

// 20:00 5K benchmark ≈ VDOT 49.8.
const fitness = { benchmark: { distanceM: 5000, timeS: 1200 }, vdot: null };

describe("raceTimeLabel", () => {
  it("formats h:mm:ss above the hour and mm:ss below", () => {
    expect(raceTimeLabel(6330)).toBe("1:45:30");
    expect(raceTimeLabel(2670)).toBe("44:30");
    expect(raceTimeLabel(3600)).toBe("1:00:00");
  });
});

describe("buildRaceDayPlan — splits", () => {
  it("conserves the plan time exactly and biases negative (opens easier, closes faster)", () => {
    for (const [distance, targetTimeS] of [
      ["5k", 1500],
      ["10k", 3000],
      ["half", 5700],
      ["marathon", 12600],
    ] as const) {
      const vm = buildRaceDayPlan({ distance, targetTimeS })!;
      const finish = vm.splits[vm.splits.length - 1];
      expect(finish.label).toBe("Finish");
      expect(finish.cumulativeS, distance).toBe(targetTimeS);
      // Negative split: the first segment's pace is slower (bigger s/km)
      // than the last segment's.
      expect(vm.splits[0].segmentPaceS).toBeGreaterThan(finish.segmentPaceS);
      // Cumulatives strictly increase.
      for (let i = 1; i < vm.splits.length; i++) {
        expect(vm.splits[i].cumulativeS).toBeGreaterThan(
          vm.splits[i - 1].cumulativeS
        );
      }
    }
  });

  it("checkpoints read per-km for short races, per-5K for long ones", () => {
    expect(
      buildRaceDayPlan({ distance: "half", targetTimeS: 5700 })!.splits.map(
        (s) => s.label
      )
    ).toEqual(["5 km", "10 km", "15 km", "20 km", "Finish"]);
    expect(
      buildRaceDayPlan({ distance: "5k", targetTimeS: 1500 })!.splits.map(
        (s) => s.label
      )
    ).toEqual(["1 km", "2 km", "3 km", "4 km", "Finish"]);
    expect(
      buildRaceDayPlan({ distance: "marathon", targetTimeS: 12600 })!.splits
    ).toHaveLength(9);
  });
});

describe("buildRaceDayPlan — pacing source", () => {
  it("paces a realistic target and tiers the goals fastest-first by source", () => {
    // 1:30 half for a 20:00-5K runner — oracle says not a long shot.
    const targetTimeS = 5400;
    expect(
      raceTargetVerdict({
        unit: "km",
        distance: "half",
        targetTimeS,
        runFitness: fitness,
      })!.band
    ).not.toBe("long_shot");
    const vm = buildRaceDayPlan({
      distance: "half",
      targetTimeS,
      runFitness: fitness,
    })!;
    expect(vm.paceSource).toBe("target");
    expect(vm.planTimeS).toBe(targetTimeS);
    expect(vm.goals.map((g) => g.tier)).toEqual(["A", "B", "C"]);
    expect(vm.goals[0].label).toBe("1:30:00");
    expect(vm.goals[0].detail).toBe("Your goal");
    expect(vm.goals[1].detail).toBe("What your recent running implies");
    expect(vm.goals[2].label).toBe("Finish");
  });

  it("a long-shot target is paced from fitness instead (oracle-checked)", () => {
    const targetTimeS = 80 * 60; // 1:20 half
    expect(
      raceTargetVerdict({
        unit: "km",
        distance: "half",
        targetTimeS,
        runFitness: fitness,
      })!.band
    ).toBe("long_shot");
    const vm = buildRaceDayPlan({
      distance: "half",
      targetTimeS,
      runFitness: fitness,
    })!;
    expect(vm.paceSource).toBe("fitness");
    expect(vm.planTimeS).toBe(predictedRaceTimesFromFitness(fitness)!.half);
    expect(vm.note).toMatch(/well beyond your recent running/i);
  });

  it("no target → paced from fitness; no target and no benchmark → null", () => {
    const vm = buildRaceDayPlan({ distance: "10k", runFitness: fitness })!;
    expect(vm.paceSource).toBe("fitness");
    expect(vm.planTimeS).toBe(predictedRaceTimesFromFitness(fitness)!["10k"]);
    expect(vm.note).toMatch(/set a goal time/i);
    expect(buildRaceDayPlan({ distance: "10k" })).toBeNull();
  });

  it("target with no benchmark: B is the labelled back-off heuristic", () => {
    const vm = buildRaceDayPlan({ distance: "half", targetTimeS: 5700 })!;
    expect(vm.paceSource).toBe("target");
    expect(vm.goals[1].detail).toMatch(/Tropos heuristic/);
    expect(vm.goals[1].label).toBe(raceTimeLabel(5700 * 1.025));
  });

  it("stays in the honest register", () => {
    const vm = buildRaceDayPlan({
      distance: "half",
      targetTimeS: 5400,
      runFitness: fitness,
    })!;
    expect(vm.note).not.toMatch(/guarantee|will run|safe/i);
    // avg pace = plan time over the distance (half 1:30 → ~256 s/km).
    expect(vm.avgPaceS).toBe(Math.round(5400 / 21.0975));
  });
});

describe("raceDayPlanVisible — the phase gate", () => {
  // Half, 10 weeks: taper = w7-8, race = w9 (getPhaseForWeek).
  it("shows in taper and race week only", () => {
    expect(raceDayPlanVisible(5, 10, "half")).toBe(false); // build
    expect(raceDayPlanVisible(1, 10, "half")).toBe(false); // base
    expect(raceDayPlanVisible(7, 10, "half")).toBe(true); // taper
    expect(raceDayPlanVisible(9, 10, "half")).toBe(true); // race
    expect(raceDayPlanVisible(null, 10, "half")).toBe(false);
    expect(raceDayPlanVisible(7, null, "half")).toBe(false);
  });
});
