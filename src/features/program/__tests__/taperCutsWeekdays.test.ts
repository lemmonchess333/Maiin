/**
 * The taper and race week ran more on the weekdays than the build (deep dive
 * D13). The owner's marathon trace: a build of five 20-minute weekday runs
 * and a long run, then a week before race week of five 30s and a race week
 * of five 30s. Two things put them there. A week with no long run gave its
 * weekday runs the long run's minutes as well, and a taper or race week fell
 * back to 30-minute easy runs whatever the build had held. Now a taper or
 * race week keeps its weekday runs to their own minutes, cut to no shorter
 * than 20, and its 30-minute runs to what the build held.
 */
import { describe, expect, it } from "vitest";
import {
  fitWeekToRunningBaseline,
  type RunningBaseline,
  type RunningClimbWeek,
} from "../runningBaseline";
import type { ScheduledRunDay } from "../programTypes";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";

const start: RunningBaseline = {
  version: 1,
  experience: "building",
  weeklyMinutes: 150,
  longestRunMinutes: 46,
  confirmedAt: "2026-03-09",
  source: "self_reported",
};
/** Where the climb has got to: a 46-minute long run and 100 minutes of
 *  weekday running, as the build ran them. */
const climb: RunningClimbWeek = { longestMinutes: 46, otherMinutes: 100 };

const easy = (dayIndex: number, templateId = "easy_30"): ScheduledRunDay => ({
  dayIndex,
  templateId,
  type: "easy",
});
const minutes = (row: ScheduledRunDay) =>
  RUN_TEMPLATES.find((t) => t.id === row.templateId)?.estimatedDuration ?? 0;
const total = (rows: ScheduledRunDay[]) =>
  rows.reduce((sum, row) => sum + minutes(row), 0);

/** The week before race week: six easy 30s, no long run. */
const lastTaperWeek = [1, 2, 3, 4, 5, 0].map((day) => easy(day));

describe("a week with no long run", () => {
  it("in the taper keeps its weekday runs to their own minutes, at 20 each", () => {
    const fitted = fitWeekToRunningBaseline(
      lastTaperWeek,
      start,
      climb,
      null,
      true
    );
    expect(fitted.map((row) => row.templateId)).toEqual(
      Array(6).fill("easy_20")
    );
    // Cut to 20 and no further: six runs, not 10-minute jogs.
    expect(total(fitted)).toBe(120);
  });

  it("as a lead-in still has the long run's minutes too", () => {
    const fitted = fitWeekToRunningBaseline(lastTaperWeek, start, climb, null);
    expect(total(fitted)).toBeGreaterThan(120);
    expect(fitted.filter((row) => row.templateId === "easy_30").length).toBe(2);
  });
});

it("a taper week with a long run is fitted as it was", () => {
  const week = [
    easy(1),
    easy(2),
    easy(3),
    easy(5),
    { dayIndex: 0, templateId: "long_6k", type: "long" } as ScheduledRunDay,
  ];
  expect(fitWeekToRunningBaseline(week, start, climb, null, true)).toEqual(
    fitWeekToRunningBaseline(week, start, climb, null)
  );
});
