import { describe, it, expect } from "vitest";
import {
  NEW_RUNNER_WEEKS,
  newRunnerBuildMinutes,
  newRunnerLongestRunMinutes,
  newRunnerUntil,
  profileNewRunnerUntil,
  runWalkTemplateIdForWeek,
} from "../newRunner";
import {
  generateRacePlanV2,
  scheduleRecoveryWeekV2,
  TAPER_WEEKS_BY_DISTANCE,
  type RacePlanV2Input,
} from "../runScheduler";
import { plannedRunMinutes } from "../runTimeLimits";
import type { ScheduledRunDay } from "../programTypes";
import type { RunningBaseline } from "../runningBaseline";
import { generateSchedule } from "@/lib/scheduleUtils";
import { starterRunSlots } from "../starterPlan";
import { DELOAD_LADDERS } from "@/lib/planDeloadWeek";
import {
  isRunWalkTemplateId,
  RUN_TEMPLATES,
  RUN_WALK_TEMPLATE_IDS,
} from "@/lib/workoutTemplates";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

/* Run20 (5): someone new to running gets no tempo or intervals in their
   first six weeks; the simulator's couch-to-5K persona had intervals from
   week 5. */
describe("a new runner's first weeks", () => {
  it("end six weeks after the day someone new to running began", () => {
    expect(NEW_RUNNER_WEEKS).toBe(6);
    expect(newRunnerUntil("new", "2026-09-07")).toBe("2026-10-19");
  });

  it("don't apply to anyone else, or before the day they began is known", () => {
    expect(newRunnerUntil("regular", "2026-09-07")).toBeNull();
    expect(newRunnerUntil("occasional", "2026-09-07")).toBeNull();
    expect(newRunnerUntil(undefined, "2026-09-07")).toBeNull();
    expect(newRunnerUntil("new", null)).toBeNull();
  });

  it("count from the day a stored profile began", () => {
    const createdAt = { toMillis: () => new Date(2026, 8, 7, 9).getTime() };
    expect(
      profileNewRunnerUntil({ runFrequency: "new", createdAt } as never)
    ).toBe("2026-10-19");
    expect(profileNewRunnerUntil({ runFrequency: "new" } as never)).toBeNull();
  });

  /* Setup counts the weeks from the day it finishes, and a plan made later
     has to count from the same day. Someone who signs up, leaves setup and
     finishes it two weeks later began running then, not at sign-up: counted
     from sign-up, their first plan held six weeks and the next Monday's
     held four. */
  it("count from the day setup finished, where the profile has it", () => {
    const createdAt = { toMillis: () => new Date(2026, 8, 7, 9).getTime() };
    const onboardingCompletedAt = {
      toMillis: () => new Date(2026, 8, 21, 18).getTime(),
    };
    expect(
      profileNewRunnerUntil({
        runFrequency: "new",
        createdAt,
        onboardingCompletedAt,
      })
    ).toBe(newRunnerUntil("new", "2026-09-21"));
    expect(newRunnerUntil("new", "2026-09-21")).toBe("2026-11-02");
    // Until the server's time comes back, and on a profile set up before
    // setup's day was kept, the day the account began.
    expect(
      profileNewRunnerUntil({
        runFrequency: "new",
        createdAt,
        onboardingCompletedAt: {},
      })
    ).toBe("2026-10-19");
  });
});

describe("the race plan in a new runner's first weeks", () => {
  const start = "2026-09-07";
  const plan = (
    distance: RacePlanV2Input["raceGoal"]["distance"],
    weeks: number,
    until: string | null,
    more: Partial<RacePlanV2Input> = {}
  ) =>
    generateRacePlanV2({
      recentLayoff: "none",
      weekSchedule: generateSchedule(0, 4),
      weeklyRunDays: 4,
      raceGoal: {
        distance,
        targetDate: localDateString(
          addLocalDays(parseLocalDate(start), weeks * 7 - 1)
        ),
      },
      currentDate: start,
      weekStart: start,
      newRunnerUntil: until,
      ...more,
    });
  const quality = (week: ScheduledRunDay[]) =>
    week.filter((run) => run.type === "tempo" || run.type === "intervals");
  const until = newRunnerUntil("new", start);

  it("holds no tempo or intervals before they end", () => {
    // A 10K ten weeks out builds from week 5: tempo, then 6 × 1K, inside
    // the first six weeks.
    const regular = plan("10k", 10, null);
    const fresh = plan("10k", 10, until);
    expect(regular.weeks.slice(0, 6).flatMap(quality).length).toBeGreaterThan(
      0
    );
    fresh.weeks.slice(0, NEW_RUNNER_WEEKS).forEach((week, i) => {
      expect(quality(week), `week ${i}`).toEqual([]);
    });
  });

  it("drops the taper's session too", () => {
    // A 5K six weeks out: light quality in the base, a time trial and the
    // taper's sharpener at 5K pace (Run24 (5)), all in the first six weeks.
    const regular = plan("5k", 6, null);
    const fresh = plan("5k", 6, until);
    expect(regular.weeks.flatMap(quality).map((r) => r.templateId)).toContain(
      "sharpener_5k"
    );
    expect(fresh.weeks.flatMap(quality)).toEqual([]);
  });

  /* The second half of Run20 (5): the first weeks run as run-walk, building
     to continuous running (NHS Couch to 5K). The simulator's new runner was
     asked for more than 20 minutes non-stop in week one. */
  it("run each week as that week's run-walk session, on spaced available days", () => {
    const fresh = plan("10k", 10, until);
    fresh.weeks.forEach((week, i) => {
      if (i >= NEW_RUNNER_WEEKS) return;
      expect(
        week.map((run) => run.dayIndex),
        `week ${i}`
      ).toEqual([1, 3, 5]);
      for (const run of week) {
        expect(run, `week ${i}`).toMatchObject({
          templateId: RUN_WALK_TEMPLATE_IDS[i],
          type: "easy",
          status: "planned",
        });
        expect(run.id).toBe(
          `runday_${run.weekKey}_${run.dayIndex}_${RUN_WALK_TEMPLATE_IDS[i]}`
        );
      }
    });
  });

  it("keep the race, with the rest of race week as run-walk", () => {
    // Strides, the long run and the race week's shakeouts all become the
    // week's run-walk: Couch to 5K has none of them.
    const fresh = plan("5k", 6, until);
    const runs = fresh.weeks.flat();
    expect(
      runs.filter((run) => run.type === "race").map((run) => run.templateId)
    ).toEqual(["5k_race"]);
    expect(
      runs
        .filter((run) => run.type !== "race")
        .every((run) => isRunWalkTemplateId(run.templateId))
    ).toBe(true);
    expect(
      fresh.weeks.at(-1)!.filter((run) => run.type !== "race")[0].templateId
    ).toBe("run_walk_6");
  });

  it("keep run-walk through a time limit and a running baseline", () => {
    // Each session fits the shortest time limit there is (30 minutes),
    // and the baseline fits continuous runs: a building runner's 10-minute
    // longest run would make a 10-minute run of the first session.
    const fresh = plan("10k", 10, until).weeks.slice(0, NEW_RUNNER_WEEKS);
    const baseline: RunningBaseline = {
      version: 1,
      experience: "building",
      weeklyMinutes: 20,
      longestRunMinutes: 10,
      confirmedAt: start,
      source: "self_reported",
    };
    expect(
      plan("10k", 10, until, {
        runTimeLimits: { sessionMinutes: 30, longRunMinutes: 30 },
      }).weeks.slice(0, NEW_RUNNER_WEEKS)
    ).toEqual(fresh);
    expect(
      plan("10k", 10, until, { runningBaseline: baseline }).weeks.slice(
        0,
        NEW_RUNNER_WEEKS
      )
    ).toEqual(fresh);
  });

  it("are no one else's, however a fit shortens their runs", () => {
    // A regular runner's 60-minute week: the baseline takes each run down
    // a step, and the nearest step below an easy 30 was a run-walk.
    const fitted = plan("10k", 10, null, {
      runTimeLimits: { sessionMinutes: 30, longRunMinutes: 30 },
      runningBaseline: {
        version: 1,
        experience: "regular",
        weeklyMinutes: 60,
        longestRunMinutes: 60,
        confirmedAt: start,
        source: "self_reported",
      },
    });
    const ids = fitted.weeks.flat().map((run) => run.templateId);
    expect(ids).toContain("easy_20");
    expect(ids.filter(isRunWalkTemplateId)).toEqual([]);
  });
});

/* The run-walk weeks end with 20 minutes non-stop, and the race plan's own
   weeks went on building underneath them: a 10K ten weeks out asked for a
   55-minute long run, a 50-minute easy run and a tempo in week 7. Each run
   now grows from those 20 minutes by five a week, the evidence's novice
   convention (about 5–10 minutes a run every 1–3 weeks), until the plan's
   own runs fit. */
describe("a new runner's runs after the run-walk weeks", () => {
  const start = "2026-09-07";
  const until = newRunnerUntil("new", start);
  const plan = (
    distance: RacePlanV2Input["raceGoal"]["distance"],
    weeks: number,
    newRunner: string | null,
    more: Partial<RacePlanV2Input> = {}
  ) =>
    generateRacePlanV2({
      recentLayoff: "none",
      weekSchedule: generateSchedule(0, 3),
      weeklyRunDays: 3,
      raceGoal: {
        distance,
        targetDate: localDateString(
          addLocalDays(parseLocalDate(start), weeks * 7 - 1)
        ),
      },
      currentDate: start,
      weekStart: start,
      newRunnerUntil: newRunner,
      ...more,
    });
  /* Run24 (8): a beginner's block holds tempo and intervals only once they
     have run 40 minutes in one go; this one ran 45 two days before. */
  const ranForty = {
    recentRuns: [{ date: "2026-09-05", duration: 45 * 60, distance: 7500 }],
    recentRunsAsOf: start,
  };
  const minutes = (run: ScheduledRunDay) =>
    plannedRunMinutes(RUN_TEMPLATES.find((t) => t.id === run.templateId)!);
  const races: [RacePlanV2Input["raceGoal"]["distance"], number][] = [
    ["5k", 9],
    ["10k", 10],
    ["10k", 14],
    ["half", 12],
    ["half", 16],
    ["marathon", 20],
  ];

  it("grow from the last session's 20 minutes, five minutes a week", () => {
    for (const [distance, weeks] of races) {
      plan(distance, weeks, until).weeks.forEach((week, i) => {
        if (i < NEW_RUNNER_WEEKS) return;
        const most = 20 + 5 * (i - NEW_RUNNER_WEEKS + 1);
        for (const run of week.filter((r) => r.type !== "race"))
          expect(
            minutes(run),
            `${distance} in ${weeks} weeks, week ${i + 1}: ${run.templateId}`
          ).toBeLessThanOrEqual(most);
      });
    }
  });

  it("take the longest run of their own kind that fits, or an easy run", () => {
    // A 10K fourteen weeks out, week 9: three weeks after run-walk, so 35
    // minutes. Week 7 is 20 minutes three times: nothing between 20 and 25
    // minutes is a run of its kind.
    const regular = plan("10k", 14, null, ranForty);
    const fresh = plan("10k", 14, until, ranForty);
    // Run24 (6): the regular week's easy run gives way to hold the week to
    // 15% over the last full week; Run24 (4): a time trial in week 7 took a
    // tempo, so this one is the ladder's next.
    expect(regular.weeks[8].map((r) => r.templateId)).toEqual([
      "long_10k",
      "easy_40",
      "tempo_20",
    ]);
    expect(fresh.weeks[8].map((r) => r.templateId)).toEqual([
      "long_6k",
      "easy_30",
      "tempo_20",
    ]);
    expect(fresh.weeks[6].map((r) => r.templateId)).toEqual([
      "easy_20",
      "easy_20",
      "easy_20",
    ]);
    expect(fresh.weeks[8].map((r) => r.id)).toEqual(
      fresh.weeks[8].map(
        (r) => `runday_${r.weekKey}_${r.dayIndex}_${r.templateId}`
      )
    );
  });

  it("are the plan's own wherever the plan's run fits, and the race is the race", () => {
    for (const [distance, weeks] of races) {
      const regular = plan(distance, weeks, null, ranForty);
      const fresh = plan(distance, weeks, until, ranForty);
      const firstTaper = weeks - 1 - TAPER_WEEKS_BY_DISTANCE[distance];
      const buildHeldQuality = fresh.weeks
        .slice(0, firstTaper)
        .flat()
        .some((run) => run.type === "tempo" || run.type === "intervals");
      fresh.weeks.forEach((week, i) => {
        if (i < NEW_RUNNER_WEEKS) return;
        const most = 20 + 5 * (i - NEW_RUNNER_WEEKS + 1);
        week.forEach((run) => {
          const own = regular.weeks[i].find((day) => day.date === run.date)!;
          // A new runner whose build never reached quality keeps the
          // taper easy, even when the sharpener now fits their minutes.
          if (
            !buildHeldQuality &&
            (own.type === "tempo" || own.type === "intervals") &&
            i >= firstTaper &&
            i < weeks - 1
          ) {
            expect(run.type).toBe("easy");
            return;
          }
          // Run22: a taper week's long run and easy runs are its shares of
          // what the build held, and a new runner's build held shorter runs
          // than the plan's own (`taperInSteps.test.ts`). Race week's easy
          // runs too stay at what the build held (deep dive D13).
          if (
            (own.type === "long" || own.type === "easy") &&
            i >= weeks - 1 - TAPER_WEEKS_BY_DISTANCE[distance] &&
            (i < weeks - 1 || own.type === "easy")
          ) {
            expect(
              minutes(run),
              `${distance} in ${weeks} weeks, week ${i + 1}`
            ).toBeLessThanOrEqual(minutes(own));
            return;
          }
          // Run24 (5): a build's quality sessions take their families in
          // turn from the runner's own first one, so a beginner's is the
          // same kind of session as the plan's that week, its family their
          // own, held to their minutes, or an easy run where nothing of its
          // family is short enough.
          if (
            (own.type === "tempo" || own.type === "intervals") &&
            i < weeks - 1 - TAPER_WEEKS_BY_DISTANCE[distance]
          ) {
            expect(
              [own.type, "easy"],
              `${distance} in ${weeks} weeks, week ${i + 1}`
            ).toContain(run.type);
            expect(run.date).toBe(own.date);
            expect(minutes(run)).toBeLessThanOrEqual(Math.max(most, 30));
            return;
          }
          if (own.type === "race" || minutes(own) <= most)
            expect(run, `${distance} in ${weeks} weeks, week ${i + 1}`).toEqual(
              own
            );
        });
      });
    }
    // A 5K fourteen weeks out is the plan's own from week 11, its quality
    // sessions the same kinds in their own families' turns (Run24 (5)).
    const regular = plan("5k", 14, null, ranForty);
    plan("5k", 14, until, ranForty)
      .weeks.slice(10)
      .forEach((week, offset) => {
        for (const run of week) {
          const own = regular.weeks[offset + 10].find(
            (day) => day.date === run.date
          )!;
          if (run.type === "tempo" || run.type === "intervals")
            expect(run.type).toBe(own.type);
          else expect(run).toEqual(own);
        }
      });
  });

  it("does not make taper the first quality week after run-walk", () => {
    // Six run-walk weeks, then a 25-minute ceiling that fits no quality.
    // The next week's 30-minute ceiling used to unlock the taper's 8×400.
    const fresh = plan("5k", 9, until);
    expect(
      fresh.weeks
        .slice(0, 7)
        .flat()
        .every((run) => run.type === "easy")
    ).toBe(true);
    // The taper holds the 20-minute runs the build did, not the 30s it
    // once fell back to (deep dive D13).
    expect(fresh.weeks[7].map((run) => run.templateId)).toEqual([
      "easy_20",
      "easy_20",
      "easy_20",
    ]);
    expect(fresh.weeks.at(-1)!.some((run) => run.type === "race")).toBe(true);
  });

  /* A tempo or intervals session that doesn't fit shortens to a smaller
     dose of itself, the deload's rungs (`DELOAD_LADDERS`), or becomes an
     easy run. 6 × 1K cut to 8 × 400 is another session, not a smaller one
     (review of #2655): someone who began on a Thursday got it, in a 5K
     nine weeks out, the week after run-walk. */
  it("shorten a quality session only to a smaller dose of itself", () => {
    const thursday = "2026-09-10";
    const fromThursday = newRunnerUntil("new", thursday);
    const family = (id: string) =>
      DELOAD_LADDERS.find((ladder) => ladder.includes(id)) ?? [id];
    for (const [distance, weeks] of [...races, ["5k", 9] as const]) {
      for (const days of [2, 3, 4]) {
        const plan2 = (newRunner: string | null) =>
          generateRacePlanV2({
            recentLayoff: "none",
            weekSchedule: generateSchedule(0, days).map((day) => ({
              ...day,
              type: starterRunSlots(generateSchedule(0, days)).includes(day.day)
                ? "run"
                : "rest",
            })),
            weeklyRunDays: Math.min(days, 3),
            raceGoal: {
              distance,
              targetDate: localDateString(
                addLocalDays(parseLocalDate(thursday), weeks * 7 - 1)
              ),
            },
            currentDate: thursday,
            weekStart: thursday,
            newRunnerUntil: newRunner,
          });
        const regular = plan2(null);
        plan2(fromThursday).weeks.forEach((week, i) =>
          week.forEach((run) => {
            if (run.type !== "tempo" && run.type !== "intervals") return;
            expect(
              family(
                regular.weeks[i].find((day) => day.date === run.date)!
                  .templateId
              ),
              `${distance} in ${weeks} weeks, ${days} days, week ${i + 1}`
            ).toContain(run.templateId);
          })
        );
      }
    }
  });

  it("are no one else's", () => {
    expect(newRunnerBuildMinutes("2026-10-26", null)).toBeNull();
    // Week 7 holds a time trial in place of its tempo (Run24 (4)).
    expect(plan("half", 16, null).weeks[6].map((r) => r.templateId)).toEqual([
      "long_14k",
      "easy_50",
      "time_trial_5k",
    ]);
  });
});

describe("the minutes a new runner's runs build to", () => {
  const until = newRunnerUntil("new", "2026-09-07"); // a Monday: 2026-10-19

  it("are none in the run-walk weeks", () => {
    expect(newRunnerBuildMinutes("2026-10-12", until)).toBeNull();
  });

  it("start five minutes past run-walk's last 20, and add five a week", () => {
    expect(
      ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"].map((w) =>
        newRunnerBuildMinutes(w, until)
      )
    ).toEqual([25, 30, 35, 40]);
    // The six weeks ending on a Wednesday: the week after is the first.
    expect(
      newRunnerBuildMinutes("2026-10-26", newRunnerUntil("new", "2026-09-09"))
    ).toBe(25);
  });
});

/* Pgm8 (R14c): setup compares a new runner's race with the longest run
   their plan reaches, so that run has to be the plan's own: the run-walk
   session's longest run, then the build's minutes. */
describe("a new runner's longest run in a week", () => {
  const until = newRunnerUntil("new", "2026-09-07"); // a Monday: 2026-10-19

  it("is the run-walk session's longest run, then the build's minutes", () => {
    expect(
      [
        "2026-09-07",
        "2026-09-14",
        "2026-09-21",
        "2026-09-28",
        "2026-10-05",
        "2026-10-12",
        "2026-10-19",
        "2026-10-26",
      ].map((w) => newRunnerLongestRunMinutes(w, until))
    ).toEqual([1, 1.5, 3, 5, 10, 20, 25, 30]);
  });

  it("is none for anyone else", () => {
    expect(newRunnerLongestRunMinutes("2026-09-07", null)).toBeNull();
    expect(newRunnerLongestRunMinutes("2026-10-26", undefined)).toBeNull();
  });
});

/* A recovery week after a race was easy 30s for everyone, so a new runner
   whose race came in the first weeks ran 30 minutes non-stop the week after
   it (review of #2655). */
describe("a new runner's recovery week", () => {
  const until = newRunnerUntil("new", "2026-09-07");
  const week = (weekStart: string, newRunner: string | null) =>
    scheduleRecoveryWeekV2({
      weekSchedule: generateSchedule(0, 3),
      weekStart,
      newRunnerUntil: newRunner,
    }).map((r) => r.templateId);

  it("is that week's run-walk in the first weeks, and the build's runs after", () => {
    expect(week("2026-10-05", until)).toEqual([
      "run_walk_5",
      "run_walk_5",
      "run_walk_5",
    ]);
    expect(week("2026-10-19", until)).toEqual([
      "easy_20",
      "easy_20",
      "easy_20",
    ]);
    expect(week("2026-10-26", until)).toEqual([
      "easy_30",
      "easy_30",
      "easy_30",
    ]);
  });

  it("is easy 30s for anyone else", () => {
    expect(week("2026-10-05", null)).toEqual(["easy_30", "easy_30", "easy_30"]);
  });
});

describe("the run-walk session for a week", () => {
  const weeks = (from: string, count: number) =>
    Array.from({ length: count }, (_, i) =>
      localDateString(addLocalDays(parseLocalDate(from), i * 7))
    );

  it("climbs the ladder a session a week through someone's first six weeks", () => {
    const until = newRunnerUntil("new", "2026-09-07"); // a Monday
    expect(
      weeks("2026-09-07", 7).map((w) => runWalkTemplateIdForWeek(w, until))
    ).toEqual([...RUN_WALK_TEMPLATE_IDS, null]);
  });

  it("repeats the first session for a part week at the start", () => {
    // Began on a Wednesday: the six weeks end on a Wednesday, so the
    // ladder's last session is that week's, and the week they began in
    // gets the first session, as the next week does.
    const until = newRunnerUntil("new", "2026-09-09");
    expect(
      weeks("2026-09-07", 8).map((w) => runWalkTemplateIdForWeek(w, until))
    ).toEqual(["run_walk_1", ...RUN_WALK_TEMPLATE_IDS, null]);
  });

  it("is none for anyone else", () => {
    expect(runWalkTemplateIdForWeek("2026-09-07", null)).toBeNull();
    expect(runWalkTemplateIdForWeek("2026-09-07", undefined)).toBeNull();
  });
});
