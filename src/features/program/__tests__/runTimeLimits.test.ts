import { describe, expect, it } from "vitest";
import {
  fitRunToTimeLimit,
  isRunTimeLimits,
  plannedRunMinutes,
} from "../runTimeLimits";
import { generateRacePlanV2, type RacePlanV2Input } from "../runScheduler";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { generateSchedule } from "@/lib/scheduleUtils";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import type { ScheduledRunDay } from "../programTypes";

const input: RacePlanV2Input = {
  weekSchedule: generateSchedule(4, 4),
  raceGoal: { distance: "marathon", targetDate: "2027-03-07" },
  currentDate: "2026-09-07",
  weekStart: "2026-09-07",
  weeklyRunDays: 4,
  recentLayoff: "none",
  tuning: { volume: "bigger", difficulty: "harder" },
};
const template = (id: string) =>
  RUN_TEMPLATES.find((candidate) => candidate.id === id)!;

describe("recurring run availability", () => {
  it("budgets distance intervals from their prescribed pace and full structure", () => {
    // 4 x 1 km @ 5:00/km + 5 min warm-up + 3 x 90s recovery + 5 min
    // cool-down = 34.5 min. The catalogue estimate is 29 min, so this pins
    // the independent structure calculation rather than testing the helper
    // against itself.
    expect(plannedRunMinutes(template("4x1k"), null, 300)).toBe(34.5);

    const run: ScheduledRunDay = {
      dayIndex: 2,
      templateId: "4x1k",
      type: "intervals",
      status: "planned",
    };
    const fitted = fitRunToTimeLimit(
      run,
      { sessionMinutes: 30, longRunMinutes: null },
      null,
      300
    );
    expect(fitted.templateId).not.toBe("4x1k");
    expect(fitted.timeLimit).toEqual({
      minutes: 30,
      originalTemplateId: "4x1k",
    });
  });

  it("keeps legacy plans identical when no limit is chosen", () => {
    expect(
      generateRacePlanV2({
        ...input,
        runTimeLimits: { sessionMinutes: null, longRunMinutes: null },
      })
    ).toEqual(generateRacePlanV2(input));
  });

  it("fits every training week at confirmed pace without moving or shortening race day", () => {
    const original = generateRacePlanV2(input);
    const limited = generateRacePlanV2({
      ...input,
      easyPaceSPerKm: 600,
      intervalPaceSPerKm: 300,
      runTimeLimits: { sessionMinutes: 30, longRunMinutes: 45 },
    });
    expect(limited.weeks.map((week) => week.map((run) => run.date))).toEqual(
      original.weeks.map((week) => week.map((run) => run.date))
    );
    expect(limited.weeks.flat().filter((run) => run.type === "race")).toEqual(
      original.weeks.flat().filter((run) => run.type === "race")
    );
    for (const run of limited.weeks
      .flat()
      .filter((run) => run.type !== "race")) {
      const limit =
        run.timeLimit?.originalTemplateId.startsWith("long_") ||
        run.type === "long"
          ? 45
          : 30;
      expect(
        plannedRunMinutes(template(run.templateId), 600, 300)
      ).toBeLessThanOrEqual(limit);
    }
    expect(
      limited.weeks
        .flat()
        .some(
          (run) =>
            run.timeLimit?.originalTemplateId.startsWith("long_") &&
            run.type === "easy"
        )
    ).toBe(true);
  });

  it("regenerates each future week to exactly the saved capped block, including taper", () => {
    const args = {
      ...input,
      easyPaceSPerKm: 420,
      intervalPaceSPerKm: 240,
      runTimeLimits: { sessionMinutes: 30, longRunMinutes: 60 },
    };
    const block = generateRacePlanV2(args);
    for (let index = 0; index < block.totalWeeks; index++) {
      const weekStart = localDateString(
        addLocalDays(parseLocalDate(input.weekStart), index * 7)
      );
      const refreshed = generateRacePlanV2({
        ...args,
        currentDate: weekStart,
        weekStart,
        planTotalWeeks: block.totalWeeks,
      });
      expect(refreshed.weeks[0]).toEqual(block.weeks[index]);
    }
  });

  it("keeps strides and quality families when a shorter tier fits", () => {
    for (const [id, type] of [
      ["easy_50_strides", "easy"],
      ["tempo_40", "tempo"],
    ]) {
      const run: ScheduledRunDay = {
        dayIndex: 2,
        templateId: id,
        type,
        status: "planned",
      };
      const fitted = fitRunToTimeLimit(run, {
        sessionMinutes: 30,
        longRunMinutes: null,
      });
      expect(fitted.type).toBe(type);
      expect(Boolean(template(fitted.templateId).config?.strides)).toBe(
        Boolean(template(id).config?.strides)
      );
      expect(
        plannedRunMinutes(template(fitted.templateId))
      ).toBeLessThanOrEqual(30);
      expect(run.templateId).toBe(id);
    }
  });

  it("does not overwrite saved work, skipped days or explicit swaps", () => {
    for (const extras of [
      { completed: true },
      { status: "skipped" as const },
      { userOverride: "easy_50" },
    ]) {
      const run: ScheduledRunDay = {
        dayIndex: 2,
        templateId: "long_20k",
        type: "long",
        ...extras,
      };
      expect(
        fitRunToTimeLimit(run, { sessionMinutes: 30, longRunMinutes: 30 })
      ).toBe(run);
    }
  });

  it("rejects malformed and unsupported limits rather than coercing them", () => {
    for (const value of [
      null,
      [],
      {},
      { sessionMinutes: "30", longRunMinutes: 60 },
      { sessionMinutes: 20, longRunMinutes: 60 },
      { sessionMinutes: NaN, longRunMinutes: 60 },
      { sessionMinutes: 45, longRunMinutes: 151 },
    ])
      expect(isRunTimeLimits(value)).toBe(false);
    expect(isRunTimeLimits({ sessionMinutes: null, longRunMinutes: 60 })).toBe(
      true
    );
  });
});
