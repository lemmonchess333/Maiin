import { describe, it, expect } from "vitest";
import {
  NEW_RUNNER_WEEKS,
  newRunnerBuildMinutes,
  newRunnerUntil,
  profileNewRunnerUntil,
  runWalkTemplateIdForWeek,
} from "../newRunner";
import {
  generateRacePlanV2,
  scheduleRecoveryWeekV2,
  type RacePlanV2Input,
} from "../runScheduler";
import { plannedRunMinutes } from "../runTimeLimits";
import type { ScheduledRunDay } from "../programTypes";
import type { RunningBaseline } from "../runningBaseline";
import { generateSchedule } from "@/lib/scheduleUtils";
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
    // A 5K six weeks out: a tempo, 6 × 1K and the taper's 8 × 400, all in
    // the first six weeks.
    const regular = plan("5k", 6, null);
    const fresh = plan("5k", 6, until);
    expect(regular.weeks.flatMap(quality).map((r) => r.templateId)).toContain(
      "8x400"
    );
    expect(fresh.weeks.flatMap(quality)).toEqual([]);
  });

  /* The second half of Run20 (5): the first weeks run as run-walk, building
     to continuous running (NHS Couch to 5K). The simulator's new runner was
     asked for more than 20 minutes non-stop in week one. */
  it("run each week as that week's run-walk session, on the same days", () => {
    const regular = plan("10k", 10, null);
    const fresh = plan("10k", 10, until);
    fresh.weeks.forEach((week, i) => {
      if (i >= NEW_RUNNER_WEEKS) return;
      expect(
        week.map((run) => run.dayIndex),
        `week ${i}`
      ).toEqual(regular.weeks[i].map((run) => run.dayIndex));
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
    const regular = plan("10k", 14, null);
    const fresh = plan("10k", 14, until);
    expect(regular.weeks[8].map((r) => r.templateId)).toEqual([
      "long_10k",
      "easy_50",
      "tempo_30",
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
      const regular = plan(distance, weeks, null);
      plan(distance, weeks, until).weeks.forEach((week, i) => {
        if (i < NEW_RUNNER_WEEKS) return;
        const most = 20 + 5 * (i - NEW_RUNNER_WEEKS + 1);
        week.forEach((run, j) => {
          const own = regular.weeks[i][j];
          if (own.type === "race" || minutes(own) <= most)
            expect(run, `${distance} in ${weeks} weeks, week ${i + 1}`).toEqual(
              own
            );
        });
      });
    }
    // A 5K fourteen weeks out is the plan's own from week 11.
    const regular = plan("5k", 14, null);
    expect(plan("5k", 14, until).weeks.slice(10)).toEqual(
      regular.weeks.slice(10)
    );
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
            weekSchedule: generateSchedule(0, days),
            weeklyRunDays: days,
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
          week.forEach((run, j) => {
            if (run.type !== "tempo" && run.type !== "intervals") return;
            expect(
              family(regular.weeks[i][j].templateId),
              `${distance} in ${weeks} weeks, ${days} days, week ${i + 1}`
            ).toContain(run.templateId);
          })
        );
      }
    }
  });

  it("are no one else's", () => {
    expect(newRunnerBuildMinutes("2026-10-26", null)).toBeNull();
    expect(plan("half", 16, null).weeks[6].map((r) => r.templateId)).toEqual([
      "long_15k",
      "easy_50",
      "tempo_30",
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
