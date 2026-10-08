import { describe, it, expect } from "vitest";
import {
  NEW_RUNNER_WEEKS,
  newRunnerUntil,
  profileNewRunnerUntil,
} from "../newRunner";
import { generateRacePlanV2, type RacePlanV2Input } from "../runScheduler";
import type { ScheduledRunDay } from "../programTypes";
import { generateSchedule } from "@/lib/scheduleUtils";
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
    until: string | null
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

  it("drops the taper's session too, and keeps the strides", () => {
    // A 5K six weeks out: a tempo, 6 × 1K and the taper's 8 × 400, all in
    // the first six weeks.
    const regular = plan("5k", 6, null);
    const fresh = plan("5k", 6, until);
    expect(regular.weeks.flatMap(quality).map((r) => r.templateId)).toContain(
      "8x400"
    );
    expect(fresh.weeks.flatMap(quality)).toEqual([]);
    const strides = (weeks: ScheduledRunDay[][]) =>
      weeks.flat().filter((run) => run.templateId.endsWith("_strides")).length;
    expect(strides(fresh.weeks)).toBeGreaterThanOrEqual(strides(regular.weeks));
    expect(strides(fresh.weeks)).toBeGreaterThan(0);
  });
});
