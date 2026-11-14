/**
 * Coming back after a break, one check for both sports (App1 Q35).
 *
 * The check reads both sports' sessions and measures each by one rule
 * (`absenceFromDays`); each side eases its own sport from it. A break from
 * a sport is time away from that sport: someone who kept the other going
 * comes back eased in the one they stopped, and carries on in the other.
 * Dates are relative to a fixed day, so nothing here reads the clock.
 */
import { describe, expect, it } from "vitest";
import type { UserProfile } from "@/lib/auth";
import {
  absenceFromDays,
  layoffFromRuns,
  runSessionDays,
  type DatedRun,
} from "../layoffDetection";
import type { DatedWorkout } from "../liftLayoff";
import { assessTrainingReturn, liftingPlan } from "../trainingReturn";

const TODAY = "2026-11-13";
const daysBefore = (n: number): string => {
  const d = new Date(Date.UTC(2026, 10, 13));
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const lifted = (n: number): DatedWorkout => ({
  date: daysBefore(n),
  exercises: [{ sets: [{}, {}, {}] }],
});
const ran = (n: number): DatedRun => ({
  date: daysBefore(n),
  distance: 5000,
  duration: 1800,
});

/** A hybrid on a race plan: the check as Home asks it. */
const hybrid = (workouts: DatedWorkout[], runs: DatedRun[]) =>
  assessTrainingReturn({
    workouts,
    runs,
    todayKey: TODAY,
    lifting: true,
    running: "race",
  });

describe("a lift-only break: stopped lifting, kept running", () => {
  const check = hybrid([lifted(25)], [ran(9), ran(2)]);

  it("eases the weights back in, easing first past three weeks", () => {
    expect(check.lift.welcomeBack).toBe(true);
    expect(check.lift.daysAway).toBe(25);
    expect(check.lift.easeBackFirst).toBe(true);
    expect(check.lift.easeBackShare).toBe(0.1);
  });

  it("leaves the running as it is: no greeting, no re-entry weeks", () => {
    expect(check.run.offer).toBeNull();
    expect(check.run.daysAway).toBe(2);
    expect(layoffFromRuns([ran(9), ran(2)], TODAY)).toBe("none");
  });
});

describe("a run-only break: stopped running, kept lifting", () => {
  const check = hybrid([lifted(25), lifted(1)], [ran(26)]);

  it("eases the running back in: the race plan rebuilds, on re-entry weeks", () => {
    expect(check.run.offer).toBe("rebuild");
    expect(check.run.daysAway).toBe(26);
    // The race plan's own read measures the same absence by the same rule.
    expect(layoffFromRuns([ran(26)], TODAY)).toBe("detrained");
  });

  it("leaves the weights as they are", () => {
    expect(check.lift.welcomeBack).toBe(false);
    expect(check.lift.daysAway).toBe(1);
  });
});

describe("a break from both", () => {
  const check = hybrid([lifted(70)], [ran(65)]);

  it("eases both back in, each by its own amounts", () => {
    expect(check.lift.welcomeBack).toBe(true);
    // More than eight weeks from the weights: 20% off.
    expect(check.lift.easeBackShare).toBe(0.2);
    expect(check.run.offer).toBe("rebuild");
    expect(layoffFromRuns([ran(65)], TODAY)).toBe("detrained");
  });

  it("keys each sport's greeting to its own last session", () => {
    expect(check.lift.dismissKey).toBe(daysBefore(70));
    expect(check.run.dismissKey).toBe(daysBefore(65));
  });

  it("a free runner is offered the easy run beside the weights", () => {
    const free = assessTrainingReturn({
      workouts: [lifted(20)],
      runs: [ran(20)],
      todayKey: TODAY,
      lifting: true,
      running: "free",
    });
    expect(free.lift.welcomeBack).toBe(true);
    expect(free.run.offer).toBe("easy-run");
  });
});

describe("one rule for both sports", () => {
  it("a sport the plan does not hold is never a return", () => {
    const check = assessTrainingReturn({
      workouts: [lifted(60)],
      runs: [ran(60)],
      todayKey: TODAY,
      lifting: false,
      running: "none",
    });
    expect(check.lift.welcomeBack).toBe(false);
    expect(check.lift.daysAway).toBeNull();
    expect(check.run.offer).toBeNull();
  });

  it("measures lifts and runs the same way, re-entry window included", () => {
    // Back after a month, once, ten days ago: still a return for three
    // weeks, in either sport.
    const lifts = [lifted(45), lifted(10)].map((w) => w.date!);
    const runs = runSessionDays([ran(45), ran(10)]);
    expect(absenceFromDays(lifts, TODAY)).toEqual(absenceFromDays(runs, TODAY));
    expect(absenceFromDays(lifts, TODAY).layoff).toBe("detrained");
  });

  it("waits for the runs before answering for running, not for lifting", () => {
    const check = assessTrainingReturn({
      workouts: [lifted(20)],
      runs: null,
      todayKey: TODAY,
      lifting: true,
      running: "free",
    });
    expect(check.run).toEqual({
      daysAway: null,
      dismissKey: null,
      offer: null,
    });
    expect(check.lift.welcomeBack).toBe(true);
  });

  it("the plan holds lifting when its week has a lifting day", () => {
    const week = (types: string[]) =>
      ({
        weekSchedule: types.map((type, day) => ({ day, type })),
      }) as Pick<UserProfile, "weekSchedule">;
    expect(
      liftingPlan(week(["rest", "lift", "rest", "run", "rest", "rest", "rest"]))
    ).toBe(true);
    expect(
      liftingPlan(
        week(["rest", "both", "rest", "rest", "rest", "rest", "rest"])
      )
    ).toBe(true);
    expect(
      liftingPlan(week(["rest", "run", "rest", "run", "rest", "rest", "rest"]))
    ).toBe(false);
    expect(liftingPlan(null)).toBe(false);
  });
});
