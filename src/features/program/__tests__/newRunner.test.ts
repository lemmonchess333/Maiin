import { describe, it, expect } from "vitest";
import {
  NEW_RUNNER_WEEKS,
  newRunnerUntil,
  profileNewRunnerUntil,
  runWalkTemplateIdForWeek,
} from "../newRunner";
import { generateRacePlanV2, type RacePlanV2Input } from "../runScheduler";
import type { ScheduledRunDay } from "../programTypes";
import type { RunningBaseline } from "../runningBaseline";
import { generateSchedule } from "@/lib/scheduleUtils";
import {
  isRunWalkTemplateId,
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

  it("holds no tempo or intervals before they end, and the plan as before after", () => {
    // A 10K ten weeks out builds from week 5: tempo, then 6 × 1K, inside
    // the first six weeks.
    const regular = plan("10k", 10, null);
    const fresh = plan("10k", 10, until);
    expect(regular.weeks.slice(0, 6).flatMap(quality).length).toBeGreaterThan(
      0
    );
    fresh.weeks.forEach((week, i) => {
      if (i < NEW_RUNNER_WEEKS) expect(quality(week), `week ${i}`).toEqual([]);
      else expect(week, `week ${i}`).toEqual(regular.weeks[i]);
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
