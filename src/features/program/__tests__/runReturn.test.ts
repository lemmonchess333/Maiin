/**
 * Who Home greets as a returning runner, and with which offer.
 *
 * The traps are the lift side's, plus one of the run side's own:
 *   - greeting someone who never left, or a brand-new account that has no
 *     run to be back from;
 *   - greeting a lifter whose plan has no running at all;
 *   - opening the race plan's welcome-back sheet before its promise holds.
 *     The sheet says the plan will ease the runner back in, and a rebuild
 *     does that only from the detrained line (`LAYOFF_DETRAINED_DAYS`).
 *     Under it, the week's realign is the weekly check's to offer.
 *
 * The rule takes the day it is asked about, so every date below is relative
 * to a fixed `TODAY` and nothing here reads the clock.
 */
import { describe, it, expect } from "vitest";
import {
  assessRunReturn,
  returnGap,
  runningPlan,
  RETURN_RUN_TEMPLATE_ID,
  type RunningPlan,
} from "../runReturn";
import { LAYOFF_DETRAINED_DAYS, type DatedRun } from "../layoffDetection";
import { WELCOME_BACK_DAYS } from "../liftLayoff";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "../programTypes";

const TODAY = "2026-09-07";
/** `TODAY` minus n days, as a "YYYY-MM-DD" key. */
const daysBefore = (n: number): string => {
  const d = new Date(Date.UTC(2026, 8, 7));
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const daysAfter = (n: number): string => daysBefore(-n);

/** A run that counts: past the distance and duration floors. */
const ran = (date: string): DatedRun => ({
  date,
  distance: 5000,
  duration: 1800,
});

const assess = (plan: RunningPlan, runs: DatedRun[] | null) =>
  assessRunReturn({ plan, runs, todayKey: TODAY });

type ProfileFields = Partial<
  Pick<UserProfile, "athleteType" | "runMode" | "raceGoal" | "weekSchedule">
>;
const profile = (fields: ProfileFields) => fields as UserProfile;
const raceGoal = (targetDate: string) =>
  ({ distance: "half", targetDate }) as UserProfile["raceGoal"];
const inRecovery = (until: string) =>
  ({
    runPlan: { phase: "recovery", recoveryEndDate: until },
  }) as unknown as ProgramState;

describe("runningPlan — whose plan has running in it", () => {
  it("a lifter's plan with no run days has none", () => {
    expect(
      runningPlan(
        profile({
          athleteType: "Lifter",
          runMode: "freeform",
          weekSchedule: [
            { day: 1, type: "lift" },
            { day: 3, type: "lift" },
            { day: 5, type: "rest" },
          ],
        }),
        null,
        TODAY
      )
    ).toBe("none");
  });

  it("no profile yet has none", () => {
    expect(runningPlan(null, null, TODAY)).toBe("none");
  });

  it("a free runner runs, whether running alone or with lifting", () => {
    for (const athleteType of ["Runner", "Hybrid"]) {
      expect(
        runningPlan(profile({ athleteType, runMode: "freeform" }), null, TODAY)
      ).toBe("free");
    }
  });

  it("a week with a run day in it runs, whoever the athlete", () => {
    expect(
      runningPlan(
        profile({
          athleteType: "Lifter",
          runMode: "freeform",
          weekSchedule: [
            { day: 1, type: "lift" },
            { day: 4, type: "both" },
          ],
        }),
        null,
        TODAY
      )
    ).toBe("free");
  });

  it("a race still ahead is a race plan", () => {
    expect(
      runningPlan(
        profile({ runMode: "race_prep", raceGoal: raceGoal(daysAfter(60)) }),
        null,
        TODAY
      )
    ).toBe("race");
  });

  it("a race day that has passed is free running", () => {
    expect(
      runningPlan(
        profile({ runMode: "race_prep", raceGoal: raceGoal(daysBefore(3)) }),
        null,
        TODAY
      )
    ).toBe("free");
  });

  it("the weeks of recovery after a race are free running", () => {
    expect(
      runningPlan(
        profile({ runMode: "race_prep", raceGoal: raceGoal(TODAY) }),
        inRecovery(daysAfter(10)),
        TODAY
      )
    ).toBe("free");
  });

  it("race prep with no race on it is free running", () => {
    expect(runningPlan(profile({ runMode: "race_prep" }), null, TODAY)).toBe(
      "free"
    );
  });
});

describe("assessRunReturn — no history, no plan, no answer yet", () => {
  it("says nothing until the runs are known", () => {
    expect(assess("free", null)).toEqual({
      daysAway: null,
      dismissKey: null,
      offer: null,
    });
  });

  it("never greets an account that has not run yet", () => {
    // Not zero days away: a new account has no run to be back from.
    expect(assess("free", [])).toEqual({
      daysAway: null,
      dismissKey: null,
      offer: null,
    });
    expect(assess("race", []).offer).toBeNull();
  });

  it("treats a history of runs that don't count as no history", () => {
    const flagged: DatedRun[] = [
      { ...ran(daysBefore(30)), isInvalid: true },
      { ...ran(daysBefore(25)), savedAnyway: true },
      { date: daysBefore(20), distance: 10, duration: 5 },
    ];
    expect(assess("free", flagged).daysAway).toBeNull();
    expect(assess("free", flagged).offer).toBeNull();
  });

  it("never greets a plan with no running, however long since a run", () => {
    expect(assess("none", [ran(daysBefore(60))]).offer).toBeNull();
  });
});

describe("assessRunReturn — a free runner, on the lifter's line", () => {
  it("offers the easy run from two weeks away", () => {
    expect(WELCOME_BACK_DAYS).toBe(14);
    expect(assess("free", [ran(daysBefore(WELCOME_BACK_DAYS))])).toEqual({
      daysAway: 14,
      dismissKey: daysBefore(14),
      offer: "easy-run",
    });
  });

  it("says nothing a day short of it", () => {
    expect(
      assess("free", [ran(daysBefore(WELCOME_BACK_DAYS - 1))]).offer
    ).toBeNull();
  });

  it("says nothing to someone who ran this week", () => {
    expect(
      assess("free", [ran(daysBefore(40)), ran(daysBefore(2))]).offer
    ).toBeNull();
  });

  it("measures from the most recent run, not the list's first", () => {
    const runs = [
      ran(daysBefore(70)),
      ran(daysBefore(16)),
      ran(daysBefore(45)),
    ];
    expect(assess("free", runs).daysAway).toBe(16);
    expect(assess("free", runs).dismissKey).toBe(daysBefore(16));
  });

  it("is not fooled by a newer run that doesn't count", () => {
    const runs: DatedRun[] = [
      ran(daysBefore(30)),
      { ...ran(daysBefore(1)), isInvalid: true },
    ];
    expect(assess("free", runs)).toEqual({
      daysAway: 30,
      dismissKey: daysBefore(30),
      offer: "easy-run",
    });
  });

  it("reads a run dated ahead of today as today, not as a gap", () => {
    expect(assess("free", [ran(daysAfter(2))]).daysAway).toBe(0);
    expect(assess("free", [ran(daysAfter(2))]).offer).toBeNull();
  });
});

describe("assessRunReturn — a race plan, on the detrained line", () => {
  it("leaves the two-to-three-week gap to the weekly check", () => {
    expect(
      assess("race", [ran(daysBefore(LAYOFF_DETRAINED_DAYS - 1))]).offer
    ).toBeNull();
    expect(
      assess("race", [ran(daysBefore(WELCOME_BACK_DAYS))]).offer
    ).toBeNull();
  });

  it("offers the rebuild from three weeks away", () => {
    expect(LAYOFF_DETRAINED_DAYS).toBe(21);
    expect(assess("race", [ran(daysBefore(LAYOFF_DETRAINED_DAYS))])).toEqual({
      daysAway: 21,
      dismissKey: daysBefore(21),
      offer: "rebuild",
    });
  });
});

describe("assessRunReturn — once per absence", () => {
  it("a run logged after dismissal ends the greeting and moves the key", () => {
    const away = assess("free", [ran(daysBefore(30))]);
    expect(away.offer).toBe("easy-run");

    // The run back: nothing to greet today, and the key the dismissal was
    // stored under is no longer the one asked about.
    const back = assess("free", [ran(daysBefore(30)), ran(TODAY)]);
    expect(back.offer).toBeNull();
    expect(back.dismissKey).toBe(TODAY);

    // The next absence asks again, under its own key.
    const nextTime = assessRunReturn({
      plan: "free",
      runs: [ran(daysBefore(30)), ran(TODAY)],
      todayKey: "2026-10-01",
    });
    expect(nextTime.offer).toBe("easy-run");
    expect(nextTime.dismissKey).not.toBe(away.dismissKey);
  });

  it("keeps the same key every day of one absence", () => {
    const runs = [ran(daysBefore(20))];
    const tomorrow = assessRunReturn({
      plan: "free",
      runs,
      todayKey: daysAfter(1),
    });
    expect(tomorrow.dismissKey).toBe(assess("free", runs).dismissKey);
  });
});

describe("returnGap — the absence, as a person would say it", () => {
  it("counts weeks for the first two months", () => {
    expect(returnGap(14)).toBe("about 2 weeks");
    expect(returnGap(24)).toBe("about 3 weeks");
    expect(returnGap(62)).toBe("about 9 weeks");
  });

  it("counts months after that, then stops counting", () => {
    expect(returnGap(63)).toBe("about 2 months");
    expect(returnGap(120)).toBe("about 4 months");
    expect(returnGap(360)).toBe("about 11 months");
    expect(returnGap(365)).toBe("more than a year");
    expect(returnGap(900)).toBe("more than a year");
  });
});

describe("the easy run it offers", () => {
  it("is a real easy run in the library", () => {
    const template = RUN_TEMPLATES.find((t) => t.id === RETURN_RUN_TEMPLATE_ID);
    expect(template?.type).toBe("easy");
    expect(template?.estimatedDuration).toBe(20);
  });
});
