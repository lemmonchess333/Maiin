import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { assertProperty } from "@/test/property";
import {
  trainingWeek,
  weekDays,
  weekDone,
  type TrainingWeekInput,
  type WeekRun,
} from "../trainingWeek";
import { isVolumeEligible } from "../runStatsEligibility";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "../dateHelpers";
import type {
  ManualCompletion,
  ScheduledRunDay,
} from "@/features/program/programTypes";

/**
 * The week's counts (`trainingWeek`), as properties. Every date is drawn
 * as days from the clock's own week, so the suite holds ninety days on and
 * in Auckland or Kiritimati, as CI runs it.
 */

const THIS_WEEK = localWeekKey(new Date());
const shift = (date: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(date), days));
/** `createdAt` as Firestore returns it: noon on that day. */
const createdOn = (date: string) => ({
  toMillis: () => parseLocalDate(date).getTime() + 12 * 3_600_000,
});

type Kind = "lift" | "run" | "both" | "rest";
const kind = fc.constantFrom<Kind>("lift", "run", "both", "rest");

/** A day near the week: from ten days before its Monday to ten after its
 *  Sunday. */
const nearDay = fc.integer({ min: -10, max: 16 });

interface Drawn {
  weekShift: number;
  schedule: Kind[];
  startShift: number | null;
  workouts: number[];
  runs: {
    day: number;
    distance: number;
    duration: number;
    isInvalid: boolean;
    savedAnyway: boolean;
  }[];
  runDays: { day: number; legacyDone: boolean; manual: boolean }[];
}

const drawn: fc.Arbitrary<Drawn> = fc.record({
  weekShift: fc.integer({ min: -3, max: 3 }),
  schedule: fc.array(kind, { minLength: 7, maxLength: 7 }),
  startShift: fc.option(fc.integer({ min: -40, max: 10 }), { nil: null }),
  workouts: fc.array(nearDay, { maxLength: 10 }),
  runs: fc.array(
    fc.record({
      day: nearDay,
      distance: fc.integer({ min: 0, max: 25_000 }),
      duration: fc.integer({ min: 0, max: 9000 }),
      isInvalid: fc.boolean(),
      savedAnyway: fc.boolean(),
    }),
    { maxLength: 10 }
  ),
  runDays: fc.uniqueArray(
    fc.record({
      day: nearDay,
      legacyDone: fc.boolean(),
      manual: fc.boolean(),
    }),
    { maxLength: 8, selector: (r) => r.day }
  ),
});

function build(d: Drawn): TrainingWeekInput {
  const weekKey = shift(THIS_WEEK, d.weekShift * 7);
  const day = (offset: number) => shift(weekKey, offset);
  const runDays: ScheduledRunDay[] = d.runDays.map((r) => {
    const date = day(r.day);
    return {
      id: `rd-${date}`,
      dayIndex: parseLocalDate(date).getDay(),
      date,
      weekKey: localWeekKey(parseLocalDate(date)),
      templateId: "easy_30",
      type: "easy",
      status: r.legacyDone ? "completed_exact" : "planned",
    } as ScheduledRunDay;
  });
  const manualCompletions: Record<string, ManualCompletion> = {};
  d.runDays.forEach((r, i) => {
    if (r.manual) manualCompletions[runDays[i].id!] = { completedAt: 0 };
  });
  return {
    weekKey,
    profile: {
      weekSchedule: d.schedule.map((type, dayOfWeek) => ({
        day: dayOfWeek,
        type,
      })),
      createdAt:
        d.startShift === null ? undefined : createdOn(day(d.startShift)),
    } as TrainingWeekInput["profile"],
    programState: { runDays, manualCompletions },
    workouts: d.workouts.map((offset) => ({ date: day(offset) })),
    runs: d.runs.map((r, i): WeekRun => ({
      id: `run-${i}`,
      day: day(r.day),
      distance: r.distance,
      duration: r.duration,
      isInvalid: r.isInvalid,
      savedAnyway: r.savedAnyway,
    })),
    now: parseLocalDate(THIS_WEEK),
  };
}

const inWeek = (input: TrainingWeekInput, date: string) => {
  const days = weekDays(input.weekKey);
  return date >= days[0] && date <= days[6];
};

describe("trainingWeek", () => {
  it("lifts done are the sessions saved for a day of the week, planned or not", () => {
    assertProperty(
      fc.property(drawn, (d) => {
        const input = build(d);
        const week = trainingWeek(input);
        expect(week.lifts.done).toBe(
          input.workouts.filter((w) => inWeek(input, w.date)).length
        );
      })
    );
  });

  it("lifts planned are the schedule's lift days from the day the account began, counted by hand", () => {
    assertProperty(
      fc.property(drawn, (d) => {
        const input = build(d);
        const start =
          d.startShift === null ? null : shift(input.weekKey, d.startShift);
        // The schedule is Sunday first; the week is Monday first.
        const planned = d.schedule.filter((kind, dayOfWeek) => {
          if (kind !== "lift" && kind !== "both") return false;
          const date = shift(
            input.weekKey,
            dayOfWeek === 0 ? 6 : dayOfWeek - 1
          );
          return !(start && date < start);
        }).length;
        expect(trainingWeek(input).lifts.planned).toBe(planned || null);
      })
    );
  });

  it("a later start never plans more", () => {
    assertProperty(
      fc.property(drawn, fc.integer({ min: 1, max: 10 }), (d, later) => {
        if (d.startShift === null) return;
        const early = trainingWeek(build(d));
        const late = trainingWeek(
          build({ ...d, startShift: d.startShift + later })
        );
        expect(late.lifts.planned ?? 0).toBeLessThanOrEqual(
          early.lifts.planned ?? 0
        );
        expect(late.runs.planned ?? 0).toBeLessThanOrEqual(
          early.runs.planned ?? 0
        );
      })
    );
  });

  it("runs done are the runs that count, plus planned runs marked done on a day with none: nothing twice", () => {
    assertProperty(
      fc.property(drawn, (d) => {
        const input = build(d);
        const week = trainingWeek(input);
        const counted = input.runs.filter(
          (r) => inWeek(input, r.day) && isVolumeEligible(r)
        );
        expect(week.runs.done).toBeGreaterThanOrEqual(counted.length);
        expect(week.runs.done).toBeLessThanOrEqual(
          counted.length + (week.runs.planned ?? 0)
        );
        const metres = counted.reduce((m, r) => m + (r.distance ?? 0), 0);
        expect(week.runs.km).toBe(Math.round(metres / 100) / 10);
      })
    );
  });

  it("runs planned and done match a count made by hand", () => {
    assertProperty(
      fc.property(drawn, (d) => {
        const input = build(d);
        const week = trainingWeek(input);
        const start =
          d.startShift === null ? null : shift(input.weekKey, d.startShift);
        const planned = d.runDays
          .map((r) => ({ ...r, date: shift(input.weekKey, r.day) }))
          .filter((r) => inWeek(input, r.date) && !(start && r.date < start));
        const ranOn = new Set(
          input.runs
            .filter((r) => inWeek(input, r.day) && isVolumeEligible(r))
            .map((r) => r.day)
        );
        const counted = input.runs.filter(
          (r) => inWeek(input, r.day) && isVolumeEligible(r)
        ).length;
        const byHand = planned.filter(
          (r) => (r.manual || r.legacyDone) && !ranOn.has(r.date)
        ).length;
        expect(week.runs.planned).toBe(planned.length || null);
        expect(week.runs.done).toBe(counted + byHand);
      })
    );
  });

  it("another session never lowers a count, and raises it by one at most", () => {
    assertProperty(
      fc.property(
        drawn,
        nearDay,
        fc.record({
          distance: fc.integer({ min: 0, max: 25_000 }),
          duration: fc.integer({ min: 0, max: 9000 }),
        }),
        (d, offset, extra) => {
          const before = trainingWeek(build(d));
          const withLift = trainingWeek(
            build({ ...d, workouts: [...d.workouts, offset] })
          );
          const added = shift(before.weekKey, offset);
          expect(withLift.lifts.done - before.lifts.done).toBe(
            inWeek(build(d), added) ? 1 : 0
          );
          const withRun = trainingWeek(
            build({
              ...d,
              runs: [
                ...d.runs,
                { day: offset, isInvalid: false, savedAnyway: false, ...extra },
              ],
            })
          );
          const gained = withRun.runs.done - before.runs.done;
          expect(gained).toBeGreaterThanOrEqual(0);
          expect(gained).toBeLessThanOrEqual(1);
        }
      )
    );
  });

  it("does not depend on the order the sessions come in", () => {
    assertProperty(
      fc.property(drawn, (d) => {
        const input = build(d);
        expect(
          trainingWeek({
            ...input,
            workouts: [...input.workouts].reverse(),
            runs: [...input.runs].reverse(),
          })
        ).toEqual(trainingWeek(input));
      })
    );
  });

  it("weekDone counts what trainingWeek counts", () => {
    assertProperty(
      fc.property(drawn, (d) => {
        const input = build(d);
        const week = trainingWeek(input);
        const done = weekDone(input);
        expect(done.lifts).toBe(week.lifts.done);
        expect(done.runs).toBe(week.runs.done);
        expect(Math.round(done.metres / 100) / 10).toBe(week.runs.km);
      })
    );
  });
});
