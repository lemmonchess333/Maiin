/**
 * The race's rest days (Lift4 (10), owner 2026-10-06): race week's session
 * is at least three days before the race, so the two days before it, and
 * race day, have no lifting.
 */
import { describe, it, expect } from "vitest";
import { isRaceRestDay, raceRestSkips, RACE_REST_DAYS } from "../raceRest";
import type { ProgramState, RunPlan } from "../programTypes";

const race = (targetDate: string, mode: RunPlan["mode"] = "race_prep") =>
  ({ mode, raceGoal: { distance: "half", targetDate } }) as RunPlan;

describe("isRaceRestDay", () => {
  it("is the two days before the race, and the day itself", () => {
    expect(RACE_REST_DAYS).toBe(2);
    const plan = race("2026-11-14");
    expect(isRaceRestDay(plan, "2026-11-11")).toBe(false);
    expect(isRaceRestDay(plan, "2026-11-12")).toBe(true);
    expect(isRaceRestDay(plan, "2026-11-13")).toBe(true);
    expect(isRaceRestDay(plan, "2026-11-14")).toBe(true);
    expect(isRaceRestDay(plan, "2026-11-15")).toBe(false);
  });

  it("counts back across a month and a year", () => {
    expect(isRaceRestDay(race("2027-01-01"), "2026-12-30")).toBe(true);
    expect(isRaceRestDay(race("2027-01-01"), "2026-12-29")).toBe(false);
    expect(isRaceRestDay(race("2026-03-01"), "2026-02-27")).toBe(true);
  });

  it("needs a race plan with a date", () => {
    expect(isRaceRestDay(race("2026-11-14", "structured"), "2026-11-13")).toBe(
      false
    );
    expect(isRaceRestDay({ mode: "race_prep" }, "2026-11-13")).toBe(false);
    expect(isRaceRestDay(undefined, "2026-11-13")).toBe(false);
  });
});

describe("raceRestSkips", () => {
  const week = (
    workouts: Array<Partial<ProgramState["workouts"][number]>>
  ): Pick<ProgramState, "runPlan" | "workouts"> => ({
    runPlan: race("2026-11-14"),
    workouts: workouts.map((day, i) => ({
      dayName: `Day ${i + 1}`,
      dayType: "full_body",
      exercises: [],
      completed: false,
      ...day,
    })),
  });

  it("names the sessions not done yet on a rest day", () => {
    expect(
      raceRestSkips(
        week([{ completed: true }, {}, { skipped: true }, {}]),
        "2026-11-13"
      )
    ).toEqual([1, 3]);
  });

  it("names none before the rest days, or when nothing is left", () => {
    expect(raceRestSkips(week([{}]), "2026-11-11")).toEqual([]);
    expect(
      raceRestSkips(
        week([{ completed: true }, { skipped: true }]),
        "2026-11-13"
      )
    ).toEqual([]);
  });
});
