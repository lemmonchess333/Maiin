/**
 * raceRunDaysReconcile — pure read-time staleness detection for race-prep
 * runDays. Targets the "Marathon Race in Base week 1" stale-data symptom:
 * stored runDays that disagree with the current week / the canonical race
 * goal. Additive + unwired; these pin the logic before the (emulator-gated)
 * load-effect wiring lands.
 */
import { describe, it, expect } from "vitest";
import {
  areRaceRunDaysStale,
  honestRaceWeekIndex,
  raceIsInFuture,
  raceMinWeeks,
} from "@/features/program/raceRunDaysReconcile";
import { generateRacePlanV2 } from "@/features/program/runScheduler";
import { localWeekKey, localDateString, addLocalDays } from "@/lib/dateHelpers";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { ScheduledRunDay } from "@/features/program/programTypes";

// A simple 7-day schedule: Mon/Wed/Fri run, others rest.
const SCHEDULE: ScheduleDay[] = Array.from({ length: 7 }, (_, day) => ({
  day,
  type:
    day === 1 || day === 3 || day === 5 ? ("run" as const) : ("rest" as const),
}));

/** Build a fresh, correctly-anchored week for `today` + a race `weeksOut`
 *  ahead — the "healthy" baseline a clean load would produce. */
function freshWeekFor(
  todayKey: string,
  distance: "5k" | "10k" | "half" | "marathon",
  raceDate: string
) {
  const weekStart = localWeekKey(new Date(`${todayKey}T12:00:00`));
  return generateRacePlanV2({
    weekSchedule: SCHEDULE,
    raceGoal: { distance, targetDate: raceDate },
    weeklyRunDays: 3,
    currentDate: todayKey,
    weekStart,
  });
}

describe("raceIsInFuture", () => {
  it("is true for a future race, false for a past one or no goal", () => {
    expect(raceIsInFuture({ targetDate: "2026-10-17" }, "2026-05-30")).toBe(
      true
    );
    expect(raceIsInFuture({ targetDate: "2026-05-01" }, "2026-05-30")).toBe(
      false
    );
    expect(raceIsInFuture(null, "2026-05-30")).toBe(false);
  });
});

describe("raceMinWeeks", () => {
  it("mirrors the engine's ideal-build lengths", () => {
    expect(raceMinWeeks("5k")).toBe(4);
    expect(raceMinWeeks("10k")).toBe(6);
    expect(raceMinWeeks("half")).toBe(8);
    expect(raceMinWeeks("marathon")).toBe(12);
  });
});

describe("areRaceRunDaysStale", () => {
  const today = "2026-05-30"; // a Saturday
  const raceDate = "2026-10-17"; // ~20 weeks out (marathon)

  it("is NOT stale for a freshly-generated current-week plan", () => {
    const fresh = freshWeekFor(today, "marathon", raceDate);
    expect(
      areRaceRunDaysStale({
        runDays: fresh.weeks[0],
        raceGoal: { distance: "marathon", targetDate: raceDate },
        weekSchedule: SCHEDULE,
        weeklyRunDays: 3,
        todayKey: today,
      })
    ).toBe(false);
  });

  it("is NOT stale when there is no race goal or no runDays", () => {
    expect(
      areRaceRunDaysStale({
        runDays: undefined,
        raceGoal: { distance: "marathon", targetDate: raceDate },
        weekSchedule: SCHEDULE,
        weeklyRunDays: 3,
        todayKey: today,
      })
    ).toBe(false);
    const fresh = freshWeekFor(today, "marathon", raceDate);
    expect(
      areRaceRunDaysStale({
        runDays: fresh.weeks[0],
        raceGoal: null,
        weekSchedule: SCHEDULE,
        weeklyRunDays: 3,
        todayKey: today,
      })
    ).toBe(false);
  });

  it("IS stale on anchor drift (runDays generated for a prior week)", () => {
    // Generate for a week 3 weeks ago — weekKey no longer matches today's.
    const threeWeeksAgo = localDateString(
      addLocalDays(new Date(`${today}T12:00:00`), -21)
    );
    const stale = freshWeekFor(threeWeeksAgo, "marathon", raceDate);
    expect(
      areRaceRunDaysStale({
        runDays: stale.weeks[0],
        raceGoal: { distance: "marathon", targetDate: raceDate },
        weekSchedule: SCHEDULE,
        weeklyRunDays: 3,
        todayKey: today,
      })
    ).toBe(true);
  });

  it("IS stale when a race-template day leaks into a non-race current week (the reported bug)", () => {
    // The reported symptom: stored week (weekKey == this week, so no anchor
    // drift) contains a marathon_race day, but a fresh week-0 marathon plan
    // 20 weeks out is Base (no race template). Phase/template mismatch.
    const thisWeekKey = localWeekKey(new Date(`${today}T12:00:00`));
    const leaked: ScheduledRunDay[] = [
      {
        id: "x",
        dayIndex: 1,
        templateId: "marathon_race",
        type: "race",
        completed: false,
        status: "planned",
        date: localDateString(addLocalDays(new Date(`${today}T12:00:00`), 1)),
        weekKey: thisWeekKey,
      },
    ];
    expect(
      areRaceRunDaysStale({
        runDays: leaked,
        raceGoal: { distance: "marathon", targetDate: raceDate },
        weekSchedule: SCHEDULE,
        weeklyRunDays: 3,
        todayKey: today,
      })
    ).toBe(true);
  });

  it("a fresh current-week race plan never contains a race template (2-week floor), so any stored current-week race day is stale", () => {
    // Engine invariant: generateRacePlanV2 floors totalWeeks at 2 and only
    // ever places the race template in the FINAL week — so weeks[0] is never
    // a race week, even for a race only days away. Confirm the floor, then
    // confirm a stored race-templated current-week day reads as stale.
    const raceDaysAway = localDateString(
      addLocalDays(new Date(`${today}T12:00:00`), 5)
    );
    const fresh = freshWeekFor(today, "5k", raceDaysAway);
    expect(fresh.totalWeeks).toBeGreaterThanOrEqual(2);
    expect(fresh.weeks[0]?.some((d) => d.type === "race")).toBe(false);

    const thisWeekKey = localWeekKey(new Date(`${today}T12:00:00`));
    const storedRaceThisWeek: ScheduledRunDay[] = [
      {
        id: "x",
        dayIndex: 1,
        templateId: "5k_race",
        type: "race",
        completed: false,
        status: "planned",
        date: localDateString(addLocalDays(new Date(`${today}T12:00:00`), 1)),
        weekKey: thisWeekKey,
      },
    ];
    expect(
      areRaceRunDaysStale({
        runDays: storedRaceThisWeek,
        raceGoal: { distance: "5k", targetDate: raceDaysAway },
        weekSchedule: SCHEDULE,
        weeklyRunDays: 3,
        todayKey: today,
      })
    ).toBe(true);
  });
});

describe("honestRaceWeekIndex", () => {
  it("reports week 0 for a fresh marathon ~20 weeks out", () => {
    const { currentWeek, totalWeeks } = honestRaceWeekIndex({
      raceGoal: { distance: "marathon", targetDate: "2026-10-17" },
      todayKey: "2026-05-30",
    });
    expect(currentWeek).toBe(0);
    expect(totalWeeks).toBeGreaterThanOrEqual(12);
  });

  it("advances the week index as the race approaches (mid-plan)", () => {
    // Marathon 8 weeks out: totalWeeks ~8, current week ~ totalWeeks-8.
    const eightWeeks = localDateString(
      addLocalDays(new Date("2026-05-30T12:00:00"), 56)
    );
    const { currentWeek, totalWeeks } = honestRaceWeekIndex({
      raceGoal: { distance: "marathon", targetDate: eightWeeks },
      todayKey: "2026-05-30",
    });
    expect(totalWeeks).toBeGreaterThanOrEqual(2);
    expect(currentWeek).toBeGreaterThanOrEqual(0);
    expect(currentWeek).toBeLessThan(totalWeeks);
  });

  it("clamps to the final week on race day", () => {
    const { currentWeek, totalWeeks } = honestRaceWeekIndex({
      raceGoal: { distance: "10k", targetDate: "2026-05-30" },
      todayKey: "2026-05-30",
    });
    expect(currentWeek).toBe(totalWeeks - 1);
  });

  it("never returns a negative or out-of-range index for a past race", () => {
    const { currentWeek, totalWeeks } = honestRaceWeekIndex({
      raceGoal: { distance: "10k", targetDate: "2026-05-01" },
      todayKey: "2026-05-30",
    });
    expect(currentWeek).toBeGreaterThanOrEqual(0);
    expect(currentWeek).toBeLessThan(totalWeeks);
  });
});
