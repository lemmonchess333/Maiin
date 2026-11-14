/**
 * The weeks ahead of a plan with no race date (Run24 (3), deep dive D7):
 * the rollover's own weeks, walked forward from the plan as it stands, with
 * its lighter weeks marked and the week its long run stops climbing. And
 * the same walk's place for "Why this run": the plan's first week, a
 * lighter week, and whether the long run still climbs.
 *
 * Every week is compared with what the rollover builds when the calendar
 * reaches it (`nextRunWeek`), so the outline cannot drift from the plan.
 */
import { describe, expect, it } from "vitest";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import type { OnboardingDraft } from "@/lib/onboardingDraft";
import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { migrateProgramState } from "../migrations";
import {
  normalizeProgramState,
  type ProgramState,
  type ScheduledRunDay,
} from "../programTypes";
import { weekHolds } from "../raceWeeksAhead";
import { ROLLING_GOALS, type RollingGoal } from "../rollingPlan";
import { rollingRunPlan, rollingWeeksFrom } from "../rollingWeek";
import { isRollingStepBack } from "../runPlanTiming";
import { nextRunWeek } from "../weekRollover";
import {
  longRunHoldOf,
  plannedLongKm,
  rollingSessionContexts,
  rollingWeeksAhead,
  ROLLING_WEEKS_SHOWN,
  type RollingWeekAhead,
} from "../rollingWeeksAhead";

const TODAY = localDateString(new Date());
const MONDAY = localWeekKey(parseLocalDate(TODAY));
const weeksOn = (weekKey: string, weeks: number) =>
  localDateString(addLocalDays(parseLocalDate(weekKey), weeks * 7));

const draft: OnboardingDraft = {
  step: 7,
  primaryGoal: "general",
  daysPerWeek: 0,
  equipment: "full_gym",
  runFrequency: "regular",
  runMode: "freeform",
  weeklyRunDays: 4,
  raceDistance: "10k",
  raceTargetDate: "",
  injuries: ["none"],
  gender: "female",
  ageRange: "25-34",
  heightCm: 168,
  weightKg: 62,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "intermediate",
};

type RunningPreferences = Parameters<typeof buildOnboardingPlan>[3];

/** A plan with no race date saved this Monday. */
function rollingPlan(
  goal: RollingGoal,
  answers: Partial<OnboardingDraft> = {},
  preferences?: RunningPreferences
): { profile: UserProfile; programState: ProgramState } {
  const plan = buildOnboardingPlan(
    { ...draft, rollingGoal: goal, ...answers },
    "recomp",
    MONDAY,
    preferences
  );
  return {
    profile: { uid: "u", ...plan.profileUpdates } as unknown as UserProfile,
    programState: migrateProgramState(
      normalizeProgramState(plan.programState),
      MONDAY
    ),
  };
}

const outline = (plan: { profile: UserProfile; programState: ProgramState }) =>
  rollingWeeksAhead({ ...plan, recentLayoff: "none", today: TODAY });

/** A week's runs, as compared: the day, the session and the fits. */
const shape = (runDays: readonly ScheduledRunDay[] | undefined) =>
  (runDays ?? []).map((day) => ({
    date: day.date,
    templateId: day.templateId,
    type: day.type,
    timeLimit: day.timeLimit?.originalTemplateId ?? null,
    trainingBasis: day.trainingBasis?.originalTemplateId ?? null,
  }));

describe("rollingWeeksAhead (Run24 (3), D7)", () => {
  it("lists the next twelve weeks by their Mondays, each the week the rollover builds", () => {
    const plan = rollingPlan("build_10k");
    const { weeks } = outline(plan);
    expect(weeks).toHaveLength(ROLLING_WEEKS_SHOWN);
    weeks.forEach((week, i) => {
      expect(week.weekKey).toBe(weeksOn(MONDAY, i + 1));
      expect(week.planWeek).toBe(i + 1);
    });
  });

  it("is the rollover's own weeks, for every goal and every kind of runner", () => {
    const runners: Array<[Partial<OnboardingDraft>, RunningPreferences?]> = [
      // Regular, with no benchmark: the trials.
      [{}],
      [{ runFrequency: "new" }],
      [{ weeklyRunDays: 3 }],
      [{}, { runTimeLimits: { sessionMinutes: 35, longRunMinutes: 50 } }],
      [
        {},
        {
          runningBaseline: {
            version: 1,
            experience: "regular",
            weeklyMinutes: 150,
            longestRunMinutes: 70,
            confirmedAt: TODAY,
            source: "self_reported",
          },
          runFitness: {
            benchmark: { distanceM: 5000, timeS: 25 * 60 },
            vdot: null,
          },
        },
      ],
    ];
    for (const goal of ROLLING_GOALS)
      for (const [answers, preferences] of runners) {
        const plan = rollingPlan(goal, answers, preferences);
        const contexts = rollingSessionContexts({
          ...plan,
          recentLayoff: "none",
          today: TODAY,
        })!;
        const { weeks } = outline(plan);
        expect(weeks).toHaveLength(ROLLING_WEEKS_SHOWN);
        let state = plan.programState;
        weeks.forEach((week, i) => {
          // No second engine: the week the calendar reaches holds the same.
          const weekStart = weeksOn(MONDAY, i + 1);
          const next = nextRunWeek(
            state,
            { weekStart, date: weekStart },
            plan.profile,
            "none",
            null,
            TODAY
          );
          state = { ...state, runDays: next.runDays, runPlan: next.runPlan };
          expect(next.runPlan?.currentWeek).toBe(week.planWeek);
          expect(plannedLongKm(next.runDays ?? [])).toBe(week.longKm);
          expect(
            weekHolds(next.runDays ?? [], { ...plan, runPlan: next.runPlan })
          ).toEqual(week.holds);
          expect(contexts.get(week.weekKey)?.lighter).toBe(week.lighter);
          expect(shape(next.runDays)).toEqual(
            shape(
              rollingWeeksFrom({
                profile: plan.profile,
                goal,
                planWeek: 1,
                weekStart: weeksOn(MONDAY, 1),
                count: i + 1,
                recentLayoff: "none",
                recentRuns: null,
                recentRunsAsOf: TODAY,
              })[i]
            )
          );
        });
      }
  });

  it("catches a plan behind the calendar up as the rollover will", () => {
    const plan = rollingPlan("keep_fit");
    // Saved two weeks ago, its runs still that week's.
    const twoWeeksAgo = weeksOn(MONDAY, -2);
    const saved = buildOnboardingPlan(
      { ...draft, rollingGoal: "keep_fit" },
      "recomp",
      twoWeeksAgo
    );
    const behind = migrateProgramState(
      normalizeProgramState(saved.programState),
      twoWeeksAgo
    );
    const { weeks } = outline({ profile: plan.profile, programState: behind });
    // This week is the plan's week 2; the outline starts at next week's 3.
    expect(weeks[0].weekKey).toBe(weeksOn(MONDAY, 1));
    expect(weeks[0].planWeek).toBe(3);
    expect(weeks[0].lighter).toBe(true);
  });

  it("marks every fourth week lighter, as the generator steps back", () => {
    const { weeks } = outline(rollingPlan("keep_fit"));
    const lighter = weeks.filter((week) => week.lighter);
    expect(lighter.map((week) => week.planWeek)).toEqual([3, 7, 11]);
    for (const week of lighter) {
      const before = weeks.find((w) => w.planWeek === week.planWeek - 1)!;
      expect(week.longKm!).toBeLessThan(before.longKm!);
    }
    expect(
      weeks.every((w) => w.lighter === isRollingStepBack(w.planWeek))
    ).toBe(true);
  });

  it("finds where each goal's long run holds, from the weeks themselves", () => {
    // Build to 10K climbs to the 10K plan's 12 km; Build to 5K to 8 km.
    const tenK = outline(rollingPlan("build_10k"));
    expect(tenK.hold?.km).toBe(12);
    expect(tenK.hold!.from > MONDAY).toBe(true);
    const climb = tenK.weeks.filter((w) => w.weekKey < tenK.hold!.from);
    expect(climb.length).toBeGreaterThan(0);
    expect(climb.every((w) => w.longKm! < 12)).toBe(true);
    expect(
      tenK.weeks
        .filter((w) => w.weekKey >= tenK.hold!.from && !w.lighter)
        .every((w) => w.longKm === 12)
    ).toBe(true);
    expect(outline(rollingPlan("build_5k")).hold?.km).toBe(8);
    // A lighter plan (Pgm6) holds lower: the generator, not the goal, says.
    const plan = rollingPlan("build_10k");
    const lighterPlan = {
      ...plan,
      profile: { ...plan.profile, runVolume: "lighter" } as UserProfile,
    };
    expect(outline(lighterPlan).hold!.km).toBeLessThan(12);
  });

  it("names the long run and the sessions as Train does, and the time trials", () => {
    // No benchmark: a 3 km trial in week 2, 5 km ones after.
    const { weeks } = outline(rollingPlan("faster_5k"));
    const names = weeks.flatMap((w) => [
      w.holds.long?.name ?? "",
      ...w.holds.quality.map((q) => q.name),
    ]);
    expect(names.some((n) => /^Long \d+K$/.test(n))).toBe(true);
    expect(names).toContain("5K time trial");
  });

  it("is empty without a plan with no race date", () => {
    const free = rollingPlan("keep_fit");
    const none = outline({
      profile: free.profile,
      programState: { ...free.programState, runPlan: undefined },
    });
    expect(none).toEqual({ weeks: [], hold: null });
    // A race goal on the profile takes the plan's place.
    const raced = outline({
      profile: { ...free.profile, runMode: "race_prep" },
      programState: free.programState,
    });
    expect(raced.weeks).toEqual([]);
  });

  it("works out a year-old plan's weeks", () => {
    const plan = rollingPlan("build_10k");
    const yearIn: ProgramState = {
      ...plan.programState,
      runPlan: rollingRunPlan("build_10k", 52, MONDAY),
    };
    const started = performance.now();
    const { weeks, hold } = outline({ ...plan, programState: yearIn });
    const ms = performance.now() - started;
    expect(weeks).toHaveLength(ROLLING_WEEKS_SHOWN);
    expect(hold?.km).toBe(12);
    // Measured 2 to 10 ms warm; the bound is loose for a loaded runner.
    expect(ms).toBeLessThan(1500);
  });
});

describe("longRunHoldOf", () => {
  const week = (
    planWeek: number,
    longKm: number | null,
    lighter = isRollingStepBack(planWeek)
  ): RollingWeekAhead => ({
    weekKey: weeksOn(MONDAY, planWeek),
    planWeek,
    lighter,
    longKm,
    holds: { race: null, long: null, quality: [], runWalk: null, runCount: 3 },
  });

  it("holds from the first week at the top, once three weeks that are not lighter keep it", () => {
    const weeks = [6, 6, 8, 6, 8, 10, 10, 8, 12, 12, 12, 10, 12].map((km, w) =>
      week(w, km)
    );
    expect(longRunHoldOf(weeks)).toEqual({ km: 12, from: weeksOn(MONDAY, 8) });
  });

  it("shows no hold while the long run is still climbing at the end", () => {
    const weeks = [6, 6, 8, 6, 8, 10, 10, 8, 12].map((km, w) => week(w, km));
    expect(longRunHoldOf(weeks)).toBeNull();
    expect(longRunHoldOf([week(0, null), week(1, null)])).toBeNull();
  });
});

describe("rollingSessionContexts", () => {
  it("gives this week and the weeks after it their place in the plan", () => {
    const plan = rollingPlan("build_10k");
    const contexts = rollingSessionContexts({
      ...plan,
      recentLayoff: "none",
      today: TODAY,
    })!;
    const first = contexts.get(MONDAY)!;
    expect(first).toEqual({
      goal: "build_10k",
      unit: "km",
      opening: true,
      lighter: false,
      longRun: { topKm: 12, holding: false },
    });
    expect(contexts.get(weeksOn(MONDAY, 3))?.lighter).toBe(true);
    const hold = outline(plan).hold!;
    expect(contexts.get(hold.from)?.longRun).toEqual({
      topKm: 12,
      holding: true,
    });
  });

  it("is null without a plan with no race date", () => {
    const plan = rollingPlan("keep_fit");
    expect(
      rollingSessionContexts({
        profile: { ...plan.profile, runMode: "race_prep" },
        programState: plan.programState,
        recentLayoff: "none",
        today: TODAY,
      })
    ).toBeNull();
  });
});
