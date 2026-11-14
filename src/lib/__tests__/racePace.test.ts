import { describe, expect, it } from "vitest";
import type { RunPlan } from "@/features/program/runScheduler";
import {
  buildTempoAtRacePace,
  racePaceWorkFor,
  raceTargetFromProfile,
  type RaceTargetProfile,
} from "../racePace";
import { prescriptivePaceTableFromFitness } from "../runPaces";
import { segmentsFromTempo } from "../runSegments";
import { runSessionAbout } from "../runSessionAbout";
import { RUN_TEMPLATES } from "../workoutTemplates";

const template = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;
const confirmed = {
  benchmark: { distanceM: 5000, timeS: 25 * 60 },
  vdot: null,
};
const marathonPlan = (currentWeek: number): RunPlan =>
  ({
    mode: "race_prep",
    raceGoal: { distance: "marathon", targetDate: "2027-06-06" },
    totalWeeks: 18,
    currentWeek,
  }) as unknown as RunPlan;
const profile = (
  raceGoal: RaceTargetProfile["raceGoal"],
  runFitness: RaceTargetProfile["runFitness"] = confirmed
): RaceTargetProfile => ({ runMode: "race_prep", raceGoal, runFitness });

/* Run24 (9), deep dive D12: with a goal time every tempo was goal pace and
   threshold was never run; without one a marathon plan had no race-pace
   work at all. */
describe("a build's tempos", () => {
  it("alternate race pace and threshold, in pairs of weeks", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(buildTempoAtRacePace)).toEqual([
      true,
      true,
      false,
      false,
      true,
      true,
      false,
      false,
    ]);
  });

  it("take every other tempo, when tempos come every other week", () => {
    const tempoWeeks = [4, 6, 8, 10];
    expect(tempoWeeks.map(buildTempoAtRacePace)).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it("run at the goal pace on race-pace weeks, and at threshold between", () => {
    const goal = profile({ distance: "marathon", targetTimeS: 4 * 3600 });
    // An 18-week marathon's build runs from week 6 to week 13.
    expect(
      racePaceWorkFor(template("tempo_30"), goal, marathonPlan(8))
    ).toEqual({
      kind: "tempo",
      goalPaceS: (4 * 3600) / 42.195,
      source: "goal",
    });
    expect(
      racePaceWorkFor(template("tempo_30"), goal, marathonPlan(10))
    ).toBeNull();
  });

  it("keep every taper tempo at race pace", () => {
    const goal = profile({ distance: "marathon", targetTimeS: 4 * 3600 });
    for (const week of [14, 15, 16]) {
      expect(
        racePaceWorkFor(template("tempo_20"), goal, marathonPlan(week))?.kind
      ).toBe("tempo");
    }
  });
});

describe("a marathon with no goal time", () => {
  const band = prescriptivePaceTableFromFitness(confirmed)!.marathon;
  const bandPace = (band[0] + band[1]) / 2;

  it("races its race-pace work at the middle of the marathon band", () => {
    const target = raceTargetFromProfile(profile({ distance: "marathon" }));
    expect(target?.source).toBe("band");
    expect(target!.targetTimeS / 42.195).toBeCloseTo(bandPace, 0);
    const work = racePaceWorkFor(
      template("long_20k"),
      profile({ distance: "marathon" }),
      marathonPlan(8)
    );
    expect(work).toMatchObject({ kind: "finish", source: "band" });
  });

  it("has none while the benchmark waits to be confirmed, or without one", () => {
    expect(
      raceTargetFromProfile(
        profile(
          { distance: "marathon" },
          { ...confirmed, pendingConfirmation: true }
        )
      )
    ).toBeNull();
    expect(
      raceTargetFromProfile(profile({ distance: "marathon" }, null))
    ).toBeNull();
  });

  it("is a marathon's alone: a half with no goal time has none", () => {
    expect(raceTargetFromProfile(profile({ distance: "half" }))).toBeNull();
  });

  it("names marathon pace, never a goal the runner did not set", () => {
    const work = racePaceWorkFor(
      template("tempo_30"),
      profile({ distance: "marathon" }),
      marathonPlan(8)
    );
    const about = runSessionAbout(template("tempo_30"), { racePace: work });
    expect(about.what).toMatch(/marathon pace/);
    expect(`${about.what} ${about.feel} ${about.ifWrong}`).not.toMatch(/goal/);
    const blocks = segmentsFromTempo(
      template("tempo_30").config.tempo!,
      "km",
      Math.round(bandPace),
      { atGoalPace: true, marathonBand: true }
    ).filter((s) => s.type === "moderate");
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.label).toMatch(/marathon pace/);
      expect(`${block.label} ${block.instruction} ${block.cue}`).not.toMatch(
        /goal/
      );
    }
  });
});
