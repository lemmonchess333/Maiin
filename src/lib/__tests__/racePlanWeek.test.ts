import { describe, it, expect } from "vitest";
import { racePlanWeek, racePlanWeekLabel } from "../racePlanWeek";

const RACE = { targetDate: "2026-10-17" };
const LAST_WEEK = { currentWeek: 14, totalWeeks: 15 };

describe("racePlanWeek", () => {
  it("is the plan's week up to and on race day", () => {
    const week = racePlanWeek({
      raceGoal: RACE,
      runPlan: { currentWeek: 2, totalWeeks: 15 },
      todayKey: "2026-07-20",
    });
    expect(week).toEqual({ kind: "plan", week: 3, of: 15 });
    expect(racePlanWeekLabel(week!, "long")).toBe("Week 3 of 15");
    expect(racePlanWeekLabel(week!, "short")).toBe("Week 3/15");
    expect(
      racePlanWeek({
        raceGoal: RACE,
        runPlan: LAST_WEEK,
        todayKey: "2026-10-17",
      })
    ).toEqual({ kind: "plan", week: 15, of: 15 });
  });

  // Owner, 1 Nov 2026: "Week 15 of 15" two weeks after the marathon.
  it("counts no week once race day has passed and nothing is recovering", () => {
    expect(
      racePlanWeek({
        raceGoal: RACE,
        runPlan: LAST_WEEK,
        todayKey: "2026-11-01",
      })
    ).toBeNull();
    // Recovery over: the phase is still set, its window is not.
    expect(
      racePlanWeek({
        raceGoal: RACE,
        runPlan: {
          ...LAST_WEEK,
          phase: "recovery",
          recoveryEndDate: "2026-10-31",
        },
        todayKey: "2026-11-01",
      })
    ).toBeNull();
  });

  it("counts the recovery's weeks from race day", () => {
    const recovering = (todayKey: string) =>
      racePlanWeek({
        raceGoal: RACE,
        runPlan: {
          ...LAST_WEEK,
          phase: "recovery",
          recoveryEndDate: "2026-11-14",
        },
        todayKey,
      });
    expect(recovering("2026-10-18")).toEqual({
      kind: "recovery",
      week: 1,
      of: 4,
    });
    expect(recovering("2026-10-24")).toMatchObject({ week: 1 });
    expect(recovering("2026-10-25")).toMatchObject({ week: 2 });
    expect(racePlanWeekLabel(recovering("2026-11-01")!, "long")).toBe(
      "Recovery week 3 of 4"
    );
    expect(racePlanWeekLabel(recovering("2026-11-01")!, "short")).toBe(
      "Recovery week 3/4"
    );
  });

  it("says Recovering when the goal is a new race set before the recovery ended", () => {
    const week = racePlanWeek({
      raceGoal: { targetDate: "2027-04-24" },
      runPlan: {
        currentWeek: 0,
        totalWeeks: 25,
        phase: "recovery",
        recoveryEndDate: "2026-11-14",
      },
      todayKey: "2026-11-01",
    });
    expect(week).toEqual({ kind: "recovery" });
    expect(racePlanWeekLabel(week!, "short")).toBe("Recovering");
  });

  it("has nothing to count without a race or a built plan", () => {
    expect(
      racePlanWeek({
        raceGoal: null,
        runPlan: LAST_WEEK,
        todayKey: "2026-07-20",
      })
    ).toBeNull();
    expect(
      racePlanWeek({ raceGoal: RACE, runPlan: null, todayKey: "2026-07-20" })
    ).toBeNull();
    // A counter past the plan's end is no week of it.
    expect(
      racePlanWeek({
        raceGoal: RACE,
        runPlan: { currentWeek: 15, totalWeeks: 15 },
        todayKey: "2026-07-20",
      })
    ).toBeNull();
  });
});
