import { describe, expect, it } from "vitest";
import { beginnerQualityWeek, newRunnerUntil } from "../newRunner";
import { generateRacePlanV2, type RacePlanV2Input } from "../runScheduler";
import type { ScheduledRunDay } from "../programTypes";
import { generateSchedule } from "@/lib/scheduleUtils";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

/* Run24 (8), deep dive D6: a new runner was given 4 x 1 km hard two weeks
   after run-walk, a run 68% longer than any they had done. A block begun as
   a new runner now holds no tempo or intervals until they have run 40
   minutes in one go. */
const start = "2026-09-07";
const until = newRunnerUntil("new", start);
const day = (weeks: number, days = 0) =>
  localDateString(addLocalDays(parseLocalDate(start), weeks * 7 + days));
const plan = (
  distance: RacePlanV2Input["raceGoal"]["distance"],
  weeks: number,
  more: Partial<RacePlanV2Input> = {}
) =>
  generateRacePlanV2({
    recentLayoff: "none",
    weekSchedule: generateSchedule(0, 4),
    weeklyRunDays: 4,
    raceGoal: { distance, targetDate: day(weeks, -1) },
    currentDate: start,
    weekStart: start,
    newRunnerUntil: until,
    ...more,
  });
const hard = (run: ScheduledRunDay) =>
  run.type === "tempo" || run.type === "intervals";

describe("a beginner's first tempo or intervals", () => {
  it("waits for a run of 40 minutes, however far into the block", () => {
    for (const [distance, weeks] of [
      ["5k", 12],
      ["10k", 16],
      ["half", 18],
      ["marathon", 24],
    ] as const) {
      const weeksOf = plan(distance, weeks).weeks;
      expect(
        weeksOf.flat().filter(hard),
        `${distance} in ${weeks} weeks`
      ).toEqual([]);
      // Strides stay: the evidence allows them from the start.
      expect(
        weeksOf
          .slice(6, -1)
          .flat()
          .some((run) => /strides/.test(run.templateId)),
        `${distance} in ${weeks} weeks`
      ).toBe(true);
    }
  });

  it("comes the week after that run, at the ladder's first rung", () => {
    // The 40-minute run on the Saturday of week 9 of a 16-week 10K: the
    // plan read on the Monday after it.
    const ran = day(8, 5);
    const read = day(9);
    const after = plan("10k", 16, {
      currentDate: read,
      weekStart: read,
      planTotalWeeks: 16,
      recentRuns: [{ date: ran, duration: 42 * 60, distance: 7000 }],
      recentRunsAsOf: read,
    });
    const first = after.weeks.flat().find(hard);
    expect(first).toBeDefined();
    expect(["tempo_20", "4x1k"]).toContain(first!.templateId);
  });

  it("counts a run of under 40 minutes, or one set aside, as none", () => {
    expect(
      beginnerQualityWeek([
        { date: "2026-10-03", duration: 39 * 60, distance: 6000 },
      ])
    ).toBeNull();
    expect(
      beginnerQualityWeek([
        {
          date: "2026-10-03",
          duration: 50 * 60,
          distance: 8000,
          isInvalid: true,
        },
      ])
    ).toBeNull();
    expect(
      beginnerQualityWeek([
        { date: "2026-10-10", duration: 45 * 60, distance: 7000 },
        { date: "2026-10-03", duration: 41 * 60, distance: 6500 },
      ])
    ).toBe("2026-10-05");
  });

  it("leaves a runner who did not begin as new alone", () => {
    const regular = plan("10k", 16, { newRunnerUntil: null });
    expect(regular.weeks.flat().some(hard)).toBe(true);
  });
});
