/**
 * dayIntensity — the day-load classifier driving the macro fat↔carb shift.
 *
 * Run intensity (from scheduled run type, AUTHORITATIVE via runDays) and lift
 * load (from Prompt A's trainingSignals) each yield a limb tier; on a combined
 * day the HARDER limb wins. Absent plan → REST. All dates LOCAL.
 */
import { describe, it, expect } from "vitest";
import {
  classifyDayIntensity,
  tierFromDayType,
  fuelShiftCalsForTier,
  fatFloorPerKgForTier,
} from "../dayIntensity";
import {
  RUN_ONLY,
  LIFT_ONLY,
  BOTH,
  FREE_RUN,
  makeProgram,
  liftDay,
  fixtureDateFor,
  fixtureKeyDay,
} from "@/test/nutritionFixtures";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { ScheduledRunDay } from "@/features/program/programTypes";

const sched = (types: Array<ScheduleDay["type"]>): ScheduleDay[] =>
  types.map((type, day) => ({ day, type }));

describe("classifyDayIntensity — run limb (runDays authoritative)", () => {
  it("RUN_ONLY: long run → HARD, easy run → EASY", () => {
    const { profile, program } = RUN_ONLY();
    const ws = profile.weekSchedule;
    // Thu (dayIndex 4) is a long run; Mon (1) is easy.
    expect(
      classifyDayIntensity({
        date: fixtureDateFor(4),
        program,
        weekSchedule: ws,
      })
    ).toBe("HARD");
    expect(
      classifyDayIntensity({
        date: fixtureDateFor(1),
        program,
        weekSchedule: ws,
      })
    ).toBe("EASY");
  });

  it("a real long run on a LIFT weekday classifies HARD — weekSchedule cannot downgrade it (clashesWithLift)", () => {
    const { profile, program } = BOTH();
    // dayIndex 3 is a "lift" weekday, but carries a clashing long run.
    expect(
      classifyDayIntensity({
        date: fixtureDateFor(3),
        program,
        weekSchedule: profile.weekSchedule,
      })
    ).toBe("HARD");
  });

  it("legacy runDay with undefined type → MODERATE (never assume easy/hard)", () => {
    const runDays: ScheduledRunDay[] = [
      {
        id: "legacy",
        dayIndex: 1,
        date: fixtureKeyDay(1),
        templateId: "x",
        type: undefined as unknown as string,
      },
    ];
    const program = makeProgram({ runDays });
    expect(
      classifyDayIntensity({
        date: fixtureDateFor(1),
        program,
        weekSchedule: sched([
          "rest",
          "run",
          "rest",
          "rest",
          "rest",
          "rest",
          "rest",
        ]),
      })
    ).toBe("MODERATE");
  });

  it("weekSchedule run day with no matching runDay → MODERATE (presence only)", () => {
    expect(
      classifyDayIntensity({
        date: fixtureDateFor(1),
        program: makeProgram({ runDays: [] }),
        weekSchedule: sched([
          "rest",
          "run",
          "rest",
          "rest",
          "rest",
          "rest",
          "rest",
        ]),
      })
    ).toBe("MODERATE");
  });
});

describe("classifyDayIntensity — lift limb + combined days", () => {
  it("LIFT_ONLY progression lift day → MODERATE; deload pulls it DOWN to EASY", () => {
    const prog = LIFT_ONLY();
    expect(
      classifyDayIntensity({
        date: fixtureDateFor(1), // Mon = lift
        program: prog.program,
        weekSchedule: prog.profile.weekSchedule,
      })
    ).toBe("MODERATE");

    const deload = LIFT_ONLY({ currentPhase: "deload", weekNumber: 4 });
    expect(
      classifyDayIntensity({
        date: fixtureDateFor(1),
        program: deload.program,
        weekSchedule: deload.profile.weekSchedule,
      })
    ).toBe("EASY");
  });

  it("BOTH: lift-deload + hard run → HARD (higher limb wins)", () => {
    const { profile, program } = BOTH({
      currentPhase: "deload",
      weekNumber: 4,
    });
    expect(
      classifyDayIntensity({
        date: fixtureDateFor(3), // long run on a lift day, deload week
        program,
        weekSchedule: profile.weekSchedule,
      })
    ).toBe("HARD");
  });

  it("heavy lift + easy run → driven by the LIFT (HARD)", () => {
    const program = makeProgram({
      primaryGoal: "hypertrophy",
      currentPhase: "progression",
      weekNumber: 2,
      workouts: [liftDay("Heavy", 8, 4, 6)], // 192 reps → high volume tier
      runDays: [
        {
          id: "e",
          dayIndex: 1,
          date: fixtureKeyDay(1),
          templateId: "easy_30",
          type: "easy",
        },
      ],
    });
    expect(
      classifyDayIntensity({
        date: fixtureDateFor(1),
        program,
        weekSchedule: sched([
          "rest",
          "both",
          "rest",
          "rest",
          "rest",
          "rest",
          "rest",
        ]),
      })
    ).toBe("HARD");
  });
});

describe("classifyDayIntensity — absent plan / safety", () => {
  it("FREE_RUN: no program, no weekSchedule → REST every day, no throw", () => {
    const { profile, program } = FREE_RUN();
    for (let d = 0; d < 7; d++) {
      expect(
        classifyDayIntensity({
          date: fixtureDateFor(d),
          program,
          weekSchedule: profile.weekSchedule,
        })
      ).toBe("REST");
    }
  });

  it("tolerates undefined program + weekSchedule", () => {
    expect(() =>
      classifyDayIntensity({ date: new Date(), program: undefined })
    ).not.toThrow();
    expect(classifyDayIntensity({ date: new Date(), program: undefined })).toBe(
      "REST"
    );
  });
});

describe("tierFromDayType (no-date fallback)", () => {
  it("rest → REST, run → MODERATE (unknown intensity)", () => {
    expect(tierFromDayType("rest")).toBe("REST");
    expect(tierFromDayType("run")).toBe("MODERATE");
  });

  it("lift uses program lift signals; both takes the higher of lift vs MODERATE run", () => {
    const deload = LIFT_ONLY({ currentPhase: "deload", weekNumber: 4 }).program;
    expect(tierFromDayType("lift", deload)).toBe("EASY");
    expect(tierFromDayType("both", deload)).toBe("MODERATE"); // max(EASY, MODERATE)
  });
});

describe("tier → fuel parameters", () => {
  it("fuel shift grows with intensity; REST is zero", () => {
    expect(fuelShiftCalsForTier("REST")).toBe(0);
    expect(fuelShiftCalsForTier("EASY")).toBeLessThan(
      fuelShiftCalsForTier("MODERATE")
    );
    expect(fuelShiftCalsForTier("MODERATE")).toBeLessThan(
      fuelShiftCalsForTier("HARD")
    );
  });

  it("HARD relaxes the fat floor below the standing daily floor", () => {
    expect(fatFloorPerKgForTier("HARD")).toBeLessThan(
      fatFloorPerKgForTier("MODERATE")
    );
  });
});
