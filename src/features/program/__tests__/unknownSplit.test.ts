/**
 * A plan's `splitType` is stored and read back by every app that opens it,
 * an older one included, so a split added later (`upper_lower_fb`, the
 * no-equipment week of five or six days) reaches apps that can't name it.
 * Every reader takes a value it doesn't know without failing or
 * miscounting: the label says nothing rather than "undefined", a save
 * keeps the week as it is, the server stores it as given, and the league
 * counts the week from its schedule, never the split.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { splitLabel } from "../programEngine";
import type { SplitType } from "../programTypes";
import { localWeekKey } from "@/lib/dateHelpers";

const require_ = createRequire(import.meta.url);
const sanitizer = require_(
  "../../../../functions/lib/programStateSanitizer"
) as {
  sanitizeProgramState: (state: unknown) => {
    value: Record<string, unknown>;
    dropped: string[];
  };
};
const league = require_("../../../../functions/lib/leaguePlanned") as {
  leaguePlanned: (
    profile: Record<string, unknown>,
    programState: Record<string, unknown> | null,
    weekKey: string
  ) => { lifts: number; runs: number; planned: number };
};

const NAMED: SplitType[] = [
  "full_body",
  "upper_lower",
  "ppl",
  "ppl_ul",
  "ppl_x2",
  "ppl_x2_fb",
  "upper_lower_fb",
];
const UNKNOWN = "a_newer_apps_split" as SplitType;

const answers = {
  primaryGoal: "hypertrophy",
  nutritionPhase: "recomp",
  experience: "intermediate",
  bodyweightKg: 80,
  sex: "male",
  liftDays: 5,
  preferredSplit: "auto",
  runMode: "freeform",
  weeklyRunDays: 0,
  equipment: "no_equipment",
  injuries: [],
  currentDate: "2026-07-28",
} as const;

describe("a split this build can't name", () => {
  it("names every split it knows, and says nothing of one it doesn't", () => {
    for (const split of NAMED) expect(splitLabel(split), split).not.toBe("");
    expect(splitLabel(UNKNOWN)).toBe("");
    expect(splitLabel(undefined)).toBe("");
  });

  it("keeps the week as it is on a save at the same days", () => {
    const built = buildPlan(answers as unknown as PlanBuilderInput);
    expect(built.programState.splitType).toBe("upper_lower_fb");
    const saved = buildPlan({
      ...answers,
      existingState: { ...built.programState, splitType: UNKNOWN },
      preserveHistory: true,
    } as unknown as PlanBuilderInput);
    expect(saved.programState.splitType).toBe(UNKNOWN);
    expect(
      saved.programState.workouts.map((day) => day.exercises.length)
    ).toEqual(built.programState.workouts.map((day) => day.exercises.length));
  });

  it("is stored by the server as given", () => {
    const { value, dropped } = sanitizer.sanitizeProgramState({
      splitType: UNKNOWN,
      workouts: [],
    });
    expect(dropped).toEqual([]);
    expect(value.splitType).toBe(UNKNOWN);
  });

  it("counts a league week from its schedule, whatever the split", () => {
    const weekSchedule = Array.from({ length: 7 }, (_, day) => ({
      day,
      type: [1, 2, 3, 5, 6].includes(day) ? "lift" : "rest",
    }));
    const profile = { weekSchedule, weeklyRunDaysTarget: 0 };
    const weekKey = localWeekKey(new Date());
    const known = league.leaguePlanned(
      profile,
      { splitType: "upper_lower_fb", runDays: [] },
      weekKey
    );
    expect(known.lifts).toBe(5);
    expect(
      league.leaguePlanned(
        profile,
        { splitType: UNKNOWN, runDays: [] },
        weekKey
      )
    ).toEqual(known);
  });
});
