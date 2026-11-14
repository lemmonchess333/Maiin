/**
 * Run24 (2), deep dive D3 and D18: a plan starts from the runner's own week
 * where it is above the plan's base. Before, every block ramped from the
 * distance's base and a starting point could only shorten a run, so a
 * runner on 330 minutes a week was given 175 in week 1 and about their
 * usual week as the peak.
 */
import { describe, expect, it } from "vitest";
import { generateRacePlanV2 } from "../runScheduler";
import type { RunningBaseline } from "../runningBaseline";
import type { ScheduledRunDay } from "../programTypes";
import { plannedRunMinutes } from "../runTimeLimits";
import { generateSchedule } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

/** Monday 9 March 2026, the day the plan is made. */
const START = "2026-03-09";

const start = (
  weeklyMinutes: number,
  longestRunMinutes: number,
  experience: RunningBaseline["experience"] = "regular"
): RunningBaseline => ({
  version: 1,
  experience,
  weeklyMinutes,
  longestRunMinutes,
  confirmedAt: START,
  source: "self_reported",
});

function plan(
  distance: "5k" | "10k" | "half" | "marathon",
  weeks: number,
  runDays: number,
  pace: number,
  runningBaseline: RunningBaseline | null
) {
  return generateRacePlanV2({
    recentLayoff: "none",
    weekSchedule: generateSchedule(0, runDays),
    weeklyRunDays: runDays,
    raceGoal: {
      distance,
      targetDate: localDateString(
        addLocalDays(parseLocalDate(START), weeks * 7 - 1)
      ),
    },
    currentDate: START,
    weekStart: START,
    easyPaceSPerKm: pace,
    runningBaseline,
  });
}

const template = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;
const longKm = (week: ScheduledRunDay[]) =>
  Math.max(
    0,
    ...week
      .filter((run) => run.type === "long")
      .map((run) => template(run.templateId).config.targetDistanceKm ?? 0)
  );
const minutes = (week: ScheduledRunDay[], pace: number) =>
  week.reduce(
    (sum, run) => sum + plannedRunMinutes(template(run.templateId), pace),
    0
  );
const easyMinutes = (week: ScheduledRunDay[]) =>
  week
    .filter((run) => run.type === "easy")
    .map((run) => template(run.templateId).estimatedDuration);

describe("a regular runner on 330 minutes a week, a half 16 weeks out", () => {
  // 120 minutes at 5:30 /km is 21.8 km: the 20 km rung. The other 210
  // minutes over four runs are 52 each: the 50-minute rung.
  const own = plan("half", 16, 5, 330, start(330, 120));
  const plain = plan("half", 16, 5, 330, null);

  it("starts from their own long run and weekday runs", () => {
    expect(longKm(own.weeks[0])).toBe(20);
    expect(easyMinutes(own.weeks[0])).toEqual([50, 50, 50, 50]);
    expect(minutes(own.weeks[0], 330)).toBeGreaterThanOrEqual(0.9 * 330);
    expect(longKm(plain.weeks[0])).toBe(10);
  });

  it("builds the long run a fifth past their own, inside the 150 minutes", () => {
    const peak = Math.max(...own.weeks.map(longKm));
    expect(peak).toBe(24);
    expect(peak * 5.5).toBeLessThanOrEqual(150);
  });

  it("takes an easy run to an hour on five run days, and no further", () => {
    const all = own.weeks.flatMap(easyMinutes);
    expect(Math.max(...all)).toBeGreaterThanOrEqual(60);
    // The medium-long, the week's one longer easy run, may pass it.
    for (const week of own.weeks) {
      const easy = easyMinutes(week).sort((a, b) => b - a);
      expect(easy.slice(1).every((m) => m <= 60)).toBe(true);
    }
  });

  it("keeps the race, and its quality sessions start two weeks sooner", () => {
    const qualityIn = (week: ScheduledRunDay[]) =>
      week.filter((run) => run.type === "tempo" || run.type === "intervals");
    const firstQuality = (weeks: ScheduledRunDay[][]) =>
      weeks.findIndex((week) => qualityIn(week).length > 0);
    // Run24 (2): a regular runner above the plan's base gets a shorter
    // base, so the build, and its first tempo, is week 5 (was week 7).
    expect(own.shortBase).toBe(true);
    expect(plain.shortBase).toBe(false);
    expect(firstQuality(own.weeks)).toBe(4);
    expect(firstQuality(plain.weeks)).toBe(6);
    // From there the weeks hold the plain plan's sessions and two more,
    // the tempo climbing a rung higher.
    const count = (weeks: ScheduledRunDay[][]) =>
      weeks.flatMap(qualityIn).length;
    expect(count(own.weeks)).toBe(count(plain.weeks) + 2);
    expect(own.weeks.flatMap(qualityIn).map((run) => run.templateId)).toContain(
      "tempo_40"
    );
    expect(own.weeks.at(-1)!.find((run) => run.type === "race")).toEqual(
      plain.weeks.at(-1)!.find((run) => run.type === "race")
    );
  });
});

describe("the short races' long runs rise from the starting point (D18)", () => {
  it("takes a 10K runner with a 75-minute long run to 14 km, past the plan's 12", () => {
    const own = plan("10k", 10, 4, 340, start(240, 75));
    expect(longKm(own.weeks[0])).toBe(12);
    expect(Math.max(...own.weeks.map(longKm))).toBe(14);
    expect(Math.max(...plan("10k", 10, 4, 340, null).weeks.map(longKm))).toBe(
      12
    );
  });

  it("takes a 5K runner with an hour's long run to 12 km, past the plan's 8", () => {
    const own = plan("5k", 8, 4, 330, start(200, 60));
    expect(longKm(own.weeks[0])).toBe(10);
    expect(Math.max(...own.weeks.map(longKm))).toBe(12);
  });

  it("holds a four-run-day runner's ordinary easy runs to 50 minutes", () => {
    const own = plan("10k", 10, 4, 340, start(240, 75));
    for (const week of own.weeks) {
      const easy = easyMinutes(week).sort((a, b) => b - a);
      expect(easy.slice(1).every((m) => m <= 50)).toBe(true);
    }
  });
});

describe("a starting point under the plan's base", () => {
  it("changes nothing it did before: it only ever shortens a run", () => {
    const own = plan("half", 16, 4, 390, start(120, 45, "building"));
    const plain = plan("half", 16, 4, 390, null);
    own.weeks.forEach((week, i) =>
      expect(longKm(week), `week ${i + 1}`).toBeLessThanOrEqual(
        longKm(plain.weeks[i])
      )
    );
  });
});
