/**
 * Run24 (2), deep dive D3: a regular runner whose own week is already above
 * the plan's base gets a shorter base. Base weeks hold no tempo or
 * intervals, and the plan gave base to 40% of the weeks before the taper
 * whoever the runner, so a regular runner on 330 minutes a week ran six
 * weeks of the easy running they already do before a 16-week half's first
 * quality session. The plan decides it once, when it is made, and carries
 * it (`RunPlan.shortBase`), so every surface that reads a week's phase reads
 * the same one.
 *
 * The dates are fixed and the clock is set to each day where the code reads
 * it: everything else takes its day as an argument.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { liftWeekLabel } from "@/lib/liftWeekLabel";
import { resolveRaceEnrichment } from "@/lib/racePace";
import { getRaceGoalPlannerState } from "@/lib/raceGoalPlanner";
import { buildRaceCockpitViewModel } from "@/lib/runProgrammeViewModel";
import { runSessionPresentation } from "@/lib/runSessionExplainer";
import { generateSchedule } from "@/lib/scheduleUtils";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { migrateProgramState } from "../migrations";
import {
  normalizeProgramState,
  type ProgramState,
  type RunPlan,
  type ScheduledRunDay,
} from "../programTypes";
import type { RunningBaseline } from "../runningBaseline";
import {
  firstBuildWeek,
  getPhaseForWeek,
  getRacePhaseLabel,
  isRunStepBackWeek,
} from "../runPlanTiming";
import { generateRacePlanV2 } from "../runScheduler";
import { isRaceBuildWeek, raceBlockWeek } from "../weekPrescription";
import { regenerateRacePlan, rollRunWeeks } from "../weekRollover";

/** Monday 9 March 2026, the day the plan is made. */
const START = "2026-03-09";
const shift = (date: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(date), days));
/** A half 16 weeks out: race week is the 16th. */
const RACE = {
  distance: "half" as const,
  targetDate: shift(START, 16 * 7 - 1),
};

const start = (
  experience: RunningBaseline["experience"],
  weeklyMinutes = 330,
  longestRunMinutes = 120
): RunningBaseline => ({
  version: 1,
  experience,
  weeklyMinutes,
  longestRunMinutes,
  confirmedAt: START,
  source: "self_reported",
});

afterEach(() => {
  vi.useRealTimers();
});

/** Runs `run` with the clock at noon on `day`. */
function onDay<T>(day: string, run: () => T): T {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(parseLocalDate(day).getTime() + 12 * 3600 * 1000);
  try {
    return run();
  } finally {
    vi.useRealTimers();
  }
}

/** A build's quality session: a base week's light session, a fartlek or
 *  short hills (Run24 (5)), is not one. */
const isQuality = (run: ScheduledRunDay) =>
  (run.type === "tempo" || run.type === "intervals") &&
  !/^(fartlek_30|hills_6x30s)$/.test(run.templateId);
const firstQualityWeek = (weeks: ScheduledRunDay[][]) =>
  weeks.findIndex((week) => week.some(isQuality));

/** The block as made on START, five run days, at 5:30 /km. */
function made(
  runningBaseline: RunningBaseline | null,
  extra: { recentLayoff?: "none" | "detrained"; newRunnerUntil?: string } = {}
) {
  return generateRacePlanV2({
    recentLayoff: extra.recentLayoff ?? "none",
    weekSchedule: generateSchedule(0, 5),
    weeklyRunDays: 5,
    raceGoal: RACE,
    currentDate: START,
    weekStart: START,
    easyPaceSPerKm: 330,
    runningBaseline,
    newRunnerUntil: extra.newRunnerUntil,
  });
}

/** Week `index` of that block, rebuilt as the carried plan does on its
 *  Monday. */
function carriedWeek(index: number, shortBase: boolean | undefined) {
  const monday = shift(START, 7 * index);
  return generateRacePlanV2({
    recentLayoff: "none",
    weekSchedule: generateSchedule(0, 5),
    weeklyRunDays: 5,
    raceGoal: RACE,
    currentDate: monday,
    weekStart: monday,
    easyPaceSPerKm: 330,
    runningBaseline: start("regular"),
    planTotalWeeks: 16,
    shortBase,
  });
}

describe("the shorter base's phases", () => {
  it("starts a 16-week half's build in week 5, not week 7", () => {
    expect(firstBuildWeek(16, "half")).toBe(6);
    expect(firstBuildWeek(16, "half", true)).toBe(4);
    expect(getRacePhaseLabel(4, 16, "half")).toBe("Base");
    expect(getRacePhaseLabel(4, 16, "half", true)).toBe("Build");
  });

  it("moves only where base ends: week 0, the taper, race week and the step-back weeks stay", () => {
    for (const distance of ["5k", "10k", "half", "marathon"] as const) {
      for (let total = 1; total <= 60; total++) {
        for (let w = 0; w < total; w++) {
          const long = getPhaseForWeek(w, total, distance);
          const short = getPhaseForWeek(w, total, distance, true);
          const at = `${distance}, week ${w} of ${total}`;
          if (w === 0) expect(short, at).toBe(long);
          if (long === "taper" || long === "race") expect(short, at).toBe(long);
          if (short === "base") expect(long, at).toBe("base");
          if (long === "build") expect(short, at).toBe("build");
          // A step-back week is a base or build week either way.
          if (isRunStepBackWeek(w, total, distance))
            expect(["base", "build"], at).toContain(short);
        }
      }
    }
  });
});

describe("who gets a shorter base", () => {
  it("a regular runner above the plan's base: the first tempo in week 5, was week 7", () => {
    const own = made(start("regular"));
    expect(own.shortBase).toBe(true);
    expect(firstQualityWeek(own.weeks)).toBe(4);
    // With 4 x 1 km beside it: a regular runner on five run days holds a
    // second quality session (Run24 (5)).
    expect(own.weeks[4].filter(isQuality).map((run) => run.templateId)).toEqual(
      ["tempo_20", "4x1k"]
    );
  });

  it("not a building runner with the same week: their plan is unchanged", () => {
    const building = made(start("building"));
    expect(building.shortBase).toBe(false);
    expect(firstQualityWeek(building.weeks)).toBe(6);
    // Built as a plan carried without the choice builds it.
    for (let i = 0; i < 16; i++)
      expect(
        generateRacePlanV2({
          recentLayoff: "none",
          weekSchedule: generateSchedule(0, 5),
          weeklyRunDays: 5,
          raceGoal: RACE,
          currentDate: shift(START, 7 * i),
          weekStart: shift(START, 7 * i),
          easyPaceSPerKm: 330,
          runningBaseline: start("building"),
          planTotalWeeks: 16,
        }).weeks[0],
        `week ${i + 1}`
      ).toEqual(building.weeks[i]);
  });

  it("not a regular runner under the plan's base, a detrained one, nor a new runner's block", () => {
    expect(made(start("regular", 120, 40)).shortBase).toBe(false);
    expect(
      made(start("regular"), { recentLayoff: "detrained" }).shortBase
    ).toBe(false);
    expect(
      made(start("regular"), { newRunnerUntil: shift(START, 42) }).shortBase
    ).toBe(false);
    expect(made(null).shortBase).toBe(false);
  });
});

describe("a carried plan keeps the choice it was made with", () => {
  it("reads a plan stored without it with the longer base, as before", () => {
    for (const index of [4, 5]) {
      const old = carriedWeek(index, undefined);
      expect(old.shortBase).toBe(false);
      expect(old.weeks[0].some(isQuality), `week ${index + 1}`).toBe(false);
    }
    expect(carriedWeek(6, undefined).weeks[0].some(isQuality)).toBe(true);
  });

  it("and a plan that holds it with the shorter one, whatever the starting point says now", () => {
    expect(carriedWeek(4, true).shortBase).toBe(true);
    expect(carriedWeek(4, true).weeks[0].some(isQuality)).toBe(true);
    // Rebuilt with the field, every week is the block's own.
    const own = made(start("regular"));
    for (let i = 0; i < 16; i++)
      expect(carriedWeek(i, true).weeks[0], `week ${i + 1}`).toEqual(
        own.weeks[i]
      );
  });
});

const PLAN_INPUT: PlanBuilderInput = {
  primaryGoal: "general",
  nutritionPhase: "recomp",
  experience: "intermediate",
  liftDays: 3,
  preferredSplit: "full_body",
  runMode: "race_prep",
  weeklyRunDays: 4,
  equipment: "full_gym",
  injuries: [],
  currentDate: START,
  raceGoal: RACE,
};

/** The plan setup saves on START, read back as the store gives it. */
function saved(runningBaseline: RunningBaseline): ProgramState {
  return onDay(START, () =>
    migrateProgramState(
      normalizeProgramState(
        JSON.parse(
          JSON.stringify(
            buildPlan({ ...PLAN_INPUT, runningBaseline }).programState
          )
        ) as ProgramState
      ),
      START
    )
  );
}

function profileOf(baseline: RunningBaseline) {
  return {
    uid: "u",
    runMode: "race_prep",
    raceGoal: RACE,
    weekSchedule: buildPlan({ ...PLAN_INPUT, runningBaseline: baseline })
      .weekSchedule,
    weeklyRunDaysTarget: 4,
    runningBaseline: baseline,
    experience: "intermediate",
  } as unknown as UserProfile;
}

/** `state` rolled on to week `index` of the block. */
function rolledTo(
  state: ProgramState,
  profile: UserProfile,
  index: number
): ProgramState {
  const monday = shift(START, 7 * index);
  return onDay(
    monday,
    () => rollRunWeeks(state, profile, monday, "none", null).state
  );
}

describe("the stored plan", () => {
  it("holds the choice for a regular runner above the base, and nothing for a building one", () => {
    expect(saved(start("regular")).runPlan?.shortBase).toBe(true);
    expect(saved(start("building")).runPlan).not.toHaveProperty("shortBase");
  });

  it("keeps it through the weekly rollover, a settings rebuild and a realign", () => {
    const baseline = start("regular");
    const state = saved(baseline);
    const profile = profileOf(baseline);
    const week5 = rolledTo(state, profile, 4);
    expect(week5.runPlan?.currentWeek).toBe(4);
    expect(week5.runPlan?.shortBase).toBe(true);
    expect(week5.runDays?.some(isQuality)).toBe(true);
    // A change in Settings rebuilds the same block.
    const rebuilt = onDay(shift(START, 28), () =>
      buildPlan({
        ...PLAN_INPUT,
        currentDate: shift(START, 28),
        runningBaseline: baseline,
        preserveHistory: true,
        existingState: week5,
      })
    );
    expect(rebuilt.programState.runPlan?.shortBase).toBe(true);
    // A realign re-plans from today with the plan's carry.
    const realigned = onDay(shift(START, 29), () =>
      regenerateRacePlan({
        profile,
        raceGoal: RACE,
        recentLayoff: "none",
        recentRuns: null,
        weekSchedule: profile.weekSchedule ?? [],
        weeklyRunDays: 4,
        currentDate: shift(START, 29),
        weekStart: shift(START, 28),
        plannedFrom: shift(START, 29),
        carry: {
          currentWeek: week5.runPlan?.currentWeek,
          totalWeeks: week5.runPlan?.totalWeeks,
          leadInWeek: week5.runPlan?.leadInWeek,
          blockInputs: week5.runPlan?.blockInputs,
          shortBase: week5.runPlan?.shortBase,
        },
      })
    );
    expect(realigned.runPlan.shortBase).toBe(true);
  });

  it("leaves a plan stored without it as it was, for the same runner", () => {
    const baseline = start("regular");
    const { shortBase: _dropped, ...oldPlan } = saved(baseline).runPlan!;
    const state = { ...saved(baseline), runPlan: oldPlan as RunPlan };
    const profile = profileOf(baseline);
    const week5 = rolledTo(state, profile, 4);
    expect(week5.runPlan).not.toHaveProperty("shortBase");
    expect(week5.runDays?.some(isQuality)).toBe(false);
    const rebuilt = onDay(shift(START, 28), () =>
      buildPlan({
        ...PLAN_INPUT,
        currentDate: shift(START, 28),
        runningBaseline: baseline,
        preserveHistory: true,
        existingState: week5,
      })
    );
    expect(rebuilt.programState.runPlan).not.toHaveProperty("shortBase");
  });
});

describe("every reader of a week's phase agrees", () => {
  /** Week 5 of the stored block, with the choice and without it. */
  const weekFive = (shortBase: boolean) => {
    const baseline = start("regular");
    let state = saved(baseline);
    if (!shortBase) {
      const { shortBase: _dropped, ...oldPlan } = state.runPlan!;
      state = { ...state, runPlan: oldPlan as RunPlan };
    }
    const profile = profileOf(baseline);
    return { state: rolledTo(state, profile, 4), baseline };
  };

  it.each([
    [true, "Build", "build"],
    [false, "Base", "base"],
  ] as const)(
    "with shortBase %s, week 5 is %s on every surface",
    (shortBase, label, phase) => {
      const { state, baseline } = weekFive(shortBase);
      const plan = state.runPlan!;
      expect(plan.currentWeek).toBe(4);
      // The generator: a build week holds its quality session.
      expect(state.runDays!.some(isQuality)).toBe(phase === "build");
      // The race card's rail.
      expect(
        buildRaceCockpitViewModel({
          raceGoal: RACE,
          currentWeek: plan.currentWeek,
          totalWeeks: plan.totalWeeks,
          shortBase: plan.shortBase,
          compressed: false,
          todayKey: shift(START, 28),
        })?.phaseLabel
      ).toBe(label);
      // "Why this run" and its week line.
      const why = runSessionPresentation({
        type: "easy",
        templateId: "easy_40",
        currentWeek: plan.currentWeek,
        totalWeeks: plan.totalWeeks,
        distance: "half",
        shortBase: plan.shortBase,
      });
      expect(why.weekLabel).toBe(`${label} · week 5 of 16`);
      // The race-pace rules.
      expect(
        resolveRaceEnrichment(
          "race_prep",
          { ...RACE, targetTimeS: 100 * 60 },
          plan
        )?.phase
      ).toBe(phase);
      // The lifting's race weeks and Train's lift label.
      expect(isRaceBuildWeek(raceBlockWeek(plan))).toBe(phase === "build");
      expect(liftWeekLabel(state, shift(START, 28), "intermediate")).toMatch(
        new RegExp(` · ${label}$`)
      );
      // Setup's planner, continuing the plan.
      expect(
        getRaceGoalPlannerState({
          distance: "half",
          targetDate: RACE.targetDate,
          currentDate: shift(START, 28),
          liftDays: 3,
          weeklyRunDays: 4,
          runningBaseline: baseline,
          existingState: state,
        }).firstWeekPhase
      ).toBe(label);
    }
  );
});

describe("setup", () => {
  it("says where the build starts and why", () => {
    const planner = getRaceGoalPlannerState({
      distance: "half",
      targetDate: RACE.targetDate,
      currentDate: START,
      liftDays: 3,
      weeklyRunDays: 4,
      runningBaseline: start("regular"),
    });
    expect(planner.statusDescription).toContain(
      "Your build starts in week 5, since you already run 330 minutes a week."
    );
    expect(
      getRaceGoalPlannerState({
        distance: "half",
        targetDate: RACE.targetDate,
        currentDate: START,
        liftDays: 3,
        weeklyRunDays: 4,
        runningBaseline: start("building"),
      }).statusDescription
    ).not.toContain("Your build starts");
  });
});
