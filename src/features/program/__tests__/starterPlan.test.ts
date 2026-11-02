import { describe, expect, it } from "vitest";
import {
  clampStarterStage,
  emptyWeeksEndingWith,
  nextStarterStage,
  runsInWeek,
  STARTER_STAGE_TEMPLATE_IDS,
  STARTER_STAGES,
  starterNewRunnerUntil,
  starterRunSlots,
  starterTemplateId,
  starterWeekDone,
} from "../starterPlan";
import {
  newRunnerLongestRunMinutes,
  runWalkTemplateIdForWeek,
} from "../newRunner";
import { scheduleStarterWeek } from "../runScheduler";
import {
  isRunWalkTemplateId,
  RUN_TEMPLATES,
  RUN_WALK_TEMPLATE_IDS,
  STARTER_NONSTOP_TEMPLATE_IDS,
} from "@/lib/workoutTemplates";
import { dateForDayOfWeek } from "@/lib/dateHelpers";
import type { ScheduleDay } from "@/lib/scheduleUtils";

// Monday week keys. Pure functions of the days given: nothing here reads
// the clock, so the dates are fixed. 2026-09-28 to 2026-10-05 holds
// Auckland's spring change and 2026-10-26 London's autumn one.
const W1 = "2026-09-21";
const W2 = "2026-09-28";
const W3 = "2026-10-05";
const W4 = "2026-10-12";
const W5 = "2026-10-19";
const W6 = "2026-10-26";

const MON = 1;
const TUE = 2;
const WED = 3;
const THU = 4;
const FRI = 5;
const SAT = 6;
const SUN = 0;

function schedule(
  days: Partial<Record<number, ScheduleDay["type"]>>
): ScheduleDay[] {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    type: days[day] ?? "rest",
  }));
}

const templateOf = (id: string) => RUN_TEMPLATES.find((t) => t.id === id);

describe("the starter's stages", () => {
  it("are nine: the six run-walk weeks, then 20, 25 and 30 minutes non-stop", () => {
    expect(STARTER_STAGES).toBe(9);
    expect(STARTER_STAGE_TEMPLATE_IDS).toEqual([
      ...RUN_WALK_TEMPLATE_IDS,
      "run_nonstop_20",
      "run_nonstop_25",
      "run_nonstop_30",
    ]);
    const nonStop = STARTER_NONSTOP_TEMPLATE_IDS.map((id) =>
      templateOf(id)?.config.runWalk?.runSecs.map((s) => s / 60)
    );
    expect(nonStop).toEqual([[20], [25], [30]]);
  });

  it("end on 30 minutes without a walk, each after a walk to warm up and before one to cool down", () => {
    for (const id of STARTER_NONSTOP_TEMPLATE_IDS) {
      const t = templateOf(id)!;
      const walk = t.config.runWalk!;
      expect(walk.walkSecs).toEqual([]);
      expect(walk.warmupWalkSec).toBe(300);
      expect(walk.cooldownWalkSec).toBe(300);
      // Run by the clock: no pace or distance, and the minutes add up.
      expect(t.config.targetPace).toBeUndefined();
      expect(t.config.targetDistanceKm).toBeUndefined();
      const seconds =
        walk.warmupWalkSec + walk.runSecs[0] + walk.cooldownWalkSec;
      expect(t.estimatedDuration).toBe(seconds / 60);
      expect(t.config.targetDurationMinutes).toBe(seconds / 60);
    }
    expect(
      templateOf(starterTemplateId(STARTER_STAGES))?.config.runWalk?.runSecs
    ).toEqual([30 * 60]);
  });

  it("are all run-walk sessions: no pace, never swapped, kept out of pace trends", () => {
    for (const id of STARTER_STAGE_TEMPLATE_IDS) {
      expect(isRunWalkTemplateId(id)).toBe(true);
    }
    expect(isRunWalkTemplateId("easy_30")).toBe(false);
  });

  it("never grow the longest run more than the ladder lets it", () => {
    const longest = STARTER_STAGE_TEMPLATE_IDS.map((id) =>
      Math.max(...templateOf(id)!.config.runWalk!.runSecs)
    );
    for (let i = 1; i < longest.length; i++) {
      expect(longest[i]).toBeGreaterThanOrEqual(longest[i - 1]);
      expect(longest[i]).toBeLessThanOrEqual(longest[i - 1] * 2);
    }
  });

  it("hold a stage to the ladder", () => {
    expect(clampStarterStage(0)).toBe(1);
    expect(clampStarterStage(-3)).toBe(1);
    expect(clampStarterStage(12)).toBe(9);
    expect(clampStarterStage(4.7)).toBe(4);
    expect(clampStarterStage(Number.NaN)).toBe(1);
    expect(starterTemplateId(1)).toBe("run_walk_1");
    expect(starterTemplateId(7)).toBe("run_nonstop_20");
    expect(starterTemplateId(99)).toBe("run_nonstop_30");
  });
});

describe("a starter week", () => {
  it("counts the runs dated in it, Monday to Sunday", () => {
    const days = ["2026-10-04", W3, "2026-10-08", "2026-10-11", W4];
    expect(runsInWeek(days, W3)).toBe(3);
    expect(runsInWeek(days, W2)).toBe(1);
    expect(runsInWeek(days, W4)).toBe(1);
  });

  it("is done with two runs, and not with one", () => {
    expect(starterWeekDone([W3, "2026-10-07"], W3)).toBe(true);
    expect(starterWeekDone([W3], W3)).toBe(false);
    // Two on one day are two runs.
    expect(starterWeekDone([W3, W3], W3)).toBe(true);
  });

  it("counts the weeks in a row with no run", () => {
    const days = ["2026-09-23"];
    expect(emptyWeeksEndingWith(days, W1)).toBe(0);
    expect(emptyWeeksEndingWith(days, W2)).toBe(1);
    expect(emptyWeeksEndingWith(days, W4)).toBe(3);
    // Counted no further than a week past the step-back gap.
    expect(emptyWeeksEndingWith(days, W6)).toBe(4);
    expect(emptyWeeksEndingWith([], W6)).toBe(4);
  });
});

describe("moving a starter on a week", () => {
  it("moves the stage on once the week was done", () => {
    expect(nextStarterStage(3, W3, [W3, "2026-10-09"])).toEqual({
      finished: false,
      stage: 4,
    });
  });

  it("repeats a week not done", () => {
    expect(nextStarterStage(3, W3, ["2026-10-09"])).toEqual({
      finished: false,
      stage: 3,
    });
    // A run outside the plan counts like any other: a week with one is
    // short, and the runs of the week before don't count toward it.
    expect(nextStarterStage(3, W3, ["2026-09-30", "2026-10-02"])).toEqual({
      finished: false,
      stage: 3,
    });
  });

  it("finishes the goal on the last stage's done week", () => {
    expect(nextStarterStage(9, W3, [W3, "2026-10-08"])).toEqual({
      finished: true,
      stage: 9,
    });
    expect(nextStarterStage(9, W3, [W3])).toEqual({
      finished: false,
      stage: 9,
    });
  });

  it("holds the stage through a gap shorter than three weeks", () => {
    const lastRuns = ["2026-09-21", "2026-09-24"];
    // W2 and W3 empty: two weeks.
    expect(nextStarterStage(5, W3, lastRuns)).toEqual({
      finished: false,
      stage: 5,
    });
  });

  it("steps back one stage once a gap reaches three weeks, and only once", () => {
    const lastRuns = ["2026-09-21", "2026-09-24"];
    // W2, W3 and W4 empty: the gap reaches three weeks as W4 is left.
    expect(nextStarterStage(5, W4, lastRuns)).toEqual({
      finished: false,
      stage: 4,
    });
    // The gap goes on: no further step back for it.
    expect(nextStarterStage(4, W5, lastRuns)).toEqual({
      finished: false,
      stage: 4,
    });
    expect(nextStarterStage(4, W6, lastRuns)).toEqual({
      finished: false,
      stage: 4,
    });
  });

  it("never steps back below the first stage", () => {
    expect(nextStarterStage(1, W4, [])).toEqual({ finished: false, stage: 1 });
    expect(nextStarterStage(1, W4, ["2026-09-15"])).toEqual({
      finished: false,
      stage: 1,
    });
  });

  it("holds the stage when the runs could not be read", () => {
    expect(nextStarterStage(6, W4, null)).toEqual({
      finished: false,
      stage: 6,
    });
  });

  it("walks a whole season from the first stage to the goal", () => {
    // Two runs every week from W1, except the third (one run) and the
    // fourth (none).
    const weeks = [W1];
    while (weeks.length < 12) weeks.push(nextMonday(weeks[weeks.length - 1]));
    const runDays = weeks.flatMap((week, i) =>
      i === 2
        ? [dateForDayOfWeek(week, THU)]
        : i === 3
          ? []
          : [dateForDayOfWeek(week, TUE), dateForDayOfWeek(week, SAT)]
    );
    let stage = 1;
    let finishedAt = -1;
    for (let i = 0; i < weeks.length; i++) {
      const step = nextStarterStage(stage, weeks[i], runDays);
      if (step.finished) {
        finishedAt = i;
        break;
      }
      stage = step.stage;
    }
    // Nine done weeks and two that were not: the goal is reached as the
    // eleventh week is left.
    expect(finishedAt).toBe(10);
  });
});

function nextMonday(weekKey: string): string {
  const [y, m, d] = weekKey.split("-").map(Number);
  const next = new Date(y, m - 1, d + 7);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

describe("the days a starter week runs on", () => {
  it("are the schedule's run days when there are three or fewer", () => {
    expect(
      starterRunSlots(schedule({ [TUE]: "run", [THU]: "both", [SAT]: "run" }))
    ).toEqual([TUE, THU, SAT]);
    expect(starterRunSlots(schedule({ [SUN]: "run", [WED]: "run" }))).toEqual([
      WED,
      SUN,
    ]);
  });

  it("are the three with the most rest between them when there are more", () => {
    // Mon to Fri: Mon, Wed, Fri leave a day between each.
    expect(
      starterRunSlots(
        schedule({
          [MON]: "run",
          [TUE]: "run",
          [WED]: "run",
          [THU]: "run",
          [FRI]: "run",
        })
      )
    ).toEqual([MON, WED, FRI]);
  });

  it("take the week round from Sunday to Monday", () => {
    // Sat, Sun, Mon, Wed: Sunday and Monday are a day apart, as are
    // Saturday and Sunday, so the spread three leave Sunday out.
    expect(
      starterRunSlots(
        schedule({ [MON]: "run", [WED]: "run", [SAT]: "run", [SUN]: "run" })
      )
    ).toEqual([MON, WED, SAT]);
  });

  it("prefer a day without a lift when the rest between is the same", () => {
    expect(
      starterRunSlots(
        schedule({
          [MON]: "both",
          [TUE]: "run",
          [THU]: "run",
          [SAT]: "run",
        })
      )
    ).toEqual([TUE, THU, SAT]);
  });

  it("are none without a run day", () => {
    expect(starterRunSlots(schedule({ [MON]: "lift" }))).toEqual([]);
  });
});

describe("scheduleStarterWeek", () => {
  const threeDays = schedule({
    [TUE]: "run",
    [THU]: "both",
    [SAT]: "run",
    [MON]: "lift",
  });

  it("plans the stage's session on each run day, in week order", () => {
    const week = scheduleStarterWeek({
      weekSchedule: threeDays,
      weekStart: W3,
      stage: 4,
    });
    expect(week.map((d) => d.date)).toEqual([
      "2026-10-06",
      "2026-10-08",
      "2026-10-10",
    ]);
    expect(week.every((d) => d.templateId === "run_walk_4")).toBe(true);
    expect(week.every((d) => d.type === "easy")).toBe(true);
    expect(week.every((d) => d.weekKey === W3)).toBe(true);
    expect(week.every((d) => d.status === "planned")).toBe(true);
    expect(new Set(week.map((d) => d.id)).size).toBe(3);
  });

  it("is the same week each time it is made", () => {
    const a = scheduleStarterWeek({
      weekSchedule: threeDays,
      weekStart: "2026-10-08",
      stage: 8,
    });
    const b = scheduleStarterWeek({
      weekSchedule: threeDays,
      weekStart: W3,
      stage: 8,
    });
    expect(a).toEqual(b);
    expect(a[0].templateId).toBe("run_nonstop_25");
  });

  it("leaves out the days before the first it may plan", () => {
    const week = scheduleStarterWeek({
      weekSchedule: threeDays,
      weekStart: W3,
      stage: 1,
      from: "2026-10-08",
    });
    expect(week.map((d) => d.date)).toEqual(["2026-10-08", "2026-10-10"]);
    expect(
      scheduleStarterWeek({
        weekSchedule: threeDays,
        weekStart: W3,
        stage: 1,
        from: "2026-10-11",
      })
    ).toEqual([]);
  });

  it("plans three of five run days", () => {
    const week = scheduleStarterWeek({
      weekSchedule: schedule({
        [MON]: "run",
        [TUE]: "run",
        [WED]: "run",
        [THU]: "run",
        [FRI]: "run",
      }),
      weekStart: W5,
      stage: 2,
    });
    expect(week.map((d) => d.dayIndex)).toEqual([MON, WED, FRI]);
  });
});

describe("a starter's place among a new runner's weeks", () => {
  it("lines each stage up with Run20's week of the same running", () => {
    const longest = (stage: number) =>
      newRunnerLongestRunMinutes(W3, starterNewRunnerUntil(stage, W3));
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(longest)).toEqual([
      1, 1.5, 3, 5, 10, 20, 20, 25, 30,
    ]);
    // The first six are the ladder's own sessions.
    for (let stage = 1; stage <= 6; stage++) {
      expect(
        runWalkTemplateIdForWeek(W3, starterNewRunnerUntil(stage, W3))
      ).toBe(starterTemplateId(stage));
    }
  });

  it("builds on from 30 minutes once the goal is finished", () => {
    const until = starterNewRunnerUntil(9, W3);
    expect(newRunnerLongestRunMinutes(W3, until)).toBe(30);
    expect(newRunnerLongestRunMinutes(W4, until)).toBe(35);
  });
});
