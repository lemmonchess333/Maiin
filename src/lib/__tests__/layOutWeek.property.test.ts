import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { assertProperty } from "@/test/property";
import {
  layOutWeek,
  type LayOutWeekInput,
  type LayoutLift,
  type LayoutSession,
  type SessionUnderWay,
  type WeekLayout,
} from "../layOutWeek";
import { weekDays } from "../trainingWeek";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "../dateHelpers";
import type { UserProfile } from "../auth";
import type { ProgramState, WorkoutDay } from "@/features/program/programTypes";

/**
 * The week laid out (TrainWk1), as properties over the plan's lifts: a
 * lift of the plan is never lost and never shown twice, a lift day holds
 * one lift to do, and every session sits in exactly one place. The week
 * is the clock's (so CI's +90 days, Auckland and Kiritimati runs each lay
 * out their own), and `today` is one of its days.
 */

const WEEK = localWeekKey(new Date());
const DAYS = weekDays(WEEK);
const shift = (date: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(date), days));

type Kind = "lift" | "run" | "both" | "rest";
type LiftMark =
  | { kind: "to-do" }
  | { kind: "skipped" }
  /** Done, its session saved on a day of the week (an index into it). */
  | { kind: "done-in-week"; day: number }
  /** Done, its session saved before the week. */
  | { kind: "done-before"; daysBack: number }
  /** Done, with no saved session named. */
  | { kind: "done-unlinked" };

const mark: fc.Arbitrary<LiftMark> = fc.oneof(
  { weight: 4, arbitrary: fc.constant({ kind: "to-do" as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: "skipped" as const }) },
  {
    weight: 3,
    arbitrary: fc
      .integer({ min: 0, max: 6 })
      .map((day) => ({ kind: "done-in-week" as const, day })),
  },
  {
    weight: 1,
    arbitrary: fc
      .integer({ min: 1, max: 14 })
      .map((daysBack) => ({ kind: "done-before" as const, daysBack })),
  },
  { weight: 1, arbitrary: fc.constant({ kind: "done-unlinked" as const }) }
);

interface Drawn {
  todayIndex: number;
  schedule: Kind[];
  /** Days from the week's Monday the account began. */
  startShift: number;
  running: boolean;
  marks: LiftMark[];
  override: number | null;
  raceWeek: boolean;
  planWeekShift: number;
  /** Lifts outside the plan, by day of the week (-3..9 reaches past it). */
  outside: number[];
  underWay: SessionUnderWay | null;
  /** Lay out another week than today's. */
  otherWeek: number;
}

const drawn: fc.Arbitrary<Drawn> = fc
  .record({
    todayIndex: fc.integer({ min: 0, max: 6 }),
    schedule: fc.array(fc.constantFrom<Kind>("lift", "run", "both", "rest"), {
      minLength: 7,
      maxLength: 7,
    }),
    startShift: fc.oneof(
      { weight: 3, arbitrary: fc.integer({ min: -60, max: -1 }) },
      { weight: 1, arbitrary: fc.integer({ min: 0, max: 6 }) }
    ),
    running: fc.boolean(),
    marks: fc.array(mark, { minLength: 1, maxLength: 6 }),
    override: fc.option(fc.integer({ min: 0, max: 6 }), { nil: null }),
    raceWeek: fc.boolean(),
    planWeekShift: fc.constantFrom(0, 0, 0, -1, 1),
    outside: fc.array(fc.integer({ min: -3, max: 9 }), { maxLength: 3 }),
    underWay: fc.option(
      fc
        .option(fc.integer({ min: 0, max: 6 }), { nil: null })
        .map((index): SessionUnderWay => ({ sport: "lift", index })),
      { nil: null }
    ),
    otherWeek: fc.constantFrom(0, 0, 0, 0, -1, 1),
  })
  // A start after today is no account at all; keep it on or before today.
  .map((d) => ({ ...d, startShift: Math.min(d.startShift, d.todayIndex) }));

function session(dayName: string, mark: LiftMark): WorkoutDay {
  const base = {
    dayName,
    dayType: "full",
    exercises: [
      {
        exerciseId: "bench-press",
        name: "Bench press",
        movementCategory: "horizontal_push",
        sets: 3,
        reps: 8,
        weight: 60,
      },
    ],
    completed: false,
  } as unknown as WorkoutDay;
  switch (mark.kind) {
    case "to-do":
      return base;
    case "skipped":
      return { ...base, skipped: true };
    case "done-unlinked":
      return { ...base, completed: true };
    default:
      return { ...base, completed: true, completedWorkoutId: `w-${dayName}` };
  }
}

function build(d: Drawn): LayOutWeekInput {
  const today = DAYS[d.todayIndex];
  const workouts = d.marks.map((m, i) => session(`Day ${i}`, m));
  const saved: { id: string; date: string }[] = [];
  d.marks.forEach((m, i) => {
    if (m.kind === "done-in-week")
      saved.push({ id: `w-Day ${i}`, date: DAYS[m.day] });
    if (m.kind === "done-before")
      saved.push({ id: `w-Day ${i}`, date: shift(DAYS[0], -m.daysBack) });
  });
  d.outside.forEach((offset, i) =>
    saved.push({ id: `outside-${i}`, date: shift(DAYS[0], offset) })
  );
  const programState = {
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 3,
    splitType: "full_body",
    workouts,
    updatedAt: 0,
    settings: { autoProgression: true, smallPlates: false },
    weekHistory: [],
    runDays: [],
    liftWeekKey: shift(WEEK, d.planWeekShift * 7),
    ...(d.override !== null ? { nextWorkoutOverride: d.override } : {}),
    ...(d.raceWeek ? { raceWeek: "race" } : {}),
  } as unknown as ProgramState;
  const profile = {
    uid: "u1",
    weekSchedule: d.schedule.map((type, day) => ({ day, type })),
    createdAt: {
      toMillis: () =>
        parseLocalDate(shift(DAYS[0], d.startShift)).getTime() + 12 * 3_600_000,
    },
    primaryGoal: d.running ? "running" : "general",
  } as unknown as UserProfile;
  return {
    weekKey: shift(WEEK, d.otherWeek * 7),
    today,
    profile,
    programState,
    workouts: saved,
    runs: [],
    claimMap: new Map(),
    inProgress: d.underWay ? [d.underWay] : [],
  };
}

const isPlanLift = (s: LayoutSession): s is LayoutLift =>
  s.sport === "lift" && s.plan;
const planLifts = (w: WeekLayout) => w.entries.filter(isPlanLift);
const toDo = (l: LayoutLift) =>
  l.state === "today" || l.state === "planned" || l.state === "in-progress";
const isLiftDay = (d: Drawn, date: string) => {
  const k = d.schedule[parseLocalDate(date).getDay()];
  return k === "lift" || k === "both";
};

describe("layOutWeek: the plan's lifts", () => {
  it("lays every lift of the plan exactly once, today's week, and none in another", () => {
    assertProperty(
      fc.property(drawn, (d) => {
        const input = build(d);
        const week = layOutWeek(input);
        const indices = planLifts(week)
          .map((l) => l.index)
          .sort((a, b) => (a ?? -1) - (b ?? -1));
        expect(indices).toEqual(
          d.otherWeek === 0 ? d.marks.map((_, i) => i) : []
        );
      })
    );
  });

  it("every session sits in exactly one place: one day, or one group", () => {
    assertProperty(
      fc.property(drawn, (d) => {
        const week = layOutWeek(build(d));
        const placed = new Map<LayoutSession, number>();
        const count = (s: LayoutSession) =>
          placed.set(s, (placed.get(s) ?? 0) + 1);
        week.days.forEach((day) =>
          day.sessions.forEach((s) => {
            expect(s.group).toBe("day");
            expect(s.date).toBe(day.date);
            count(s);
          })
        );
        const groups: [LayoutLift[], string][] = [
          [week.stillToDo, "still-to-do"],
          [week.skipped, "skipped"],
          [week.raceRest, "race-rest"],
          [week.doneOffWeek, "done-off-week"],
        ];
        for (const [list, group] of groups)
          list.forEach((l) => {
            expect(l.group).toBe(group);
            count(l);
          });
        for (const s of week.entries)
          if (s.group !== "before-start") expect(placed.get(s)).toBe(1);
        expect(placed.size).toBe(
          week.entries.filter((s) => s.group !== "before-start").length
        );
      })
    );
  });

  it("a lift to do sits alone on a lift day from today on, one lift per day", () => {
    assertProperty(
      fc.property(drawn, (d) => {
        const input = build(d);
        const week = layOutWeek(input);
        const laid = planLifts(week).filter(
          (l) => l.state === "today" || l.state === "planned"
        );
        const dates = laid.map((l) => l.date!);
        expect(new Set(dates).size).toBe(dates.length);
        for (const l of laid) {
          expect(l.date! >= input.today).toBe(true);
          expect(isLiftDay(d, l.date!)).toBe(true);
          expect(l.state === "today").toBe(l.date === input.today);
          const sameDay = planLifts(week).filter(
            (o) => o.group === "day" && o.date === l.date
          );
          expect(sameDay).toEqual([l]);
        }
      })
    );
  });

  it("the lifts still to do are the ones the free lift days could not hold, and only then", () => {
    assertProperty(
      fc.property(drawn, (d) => {
        const week = layOutWeek(build(d));
        const laid = planLifts(week).filter(
          (l) => l.state === "today" || l.state === "planned"
        );
        if (week.stillToDo.length > 0)
          expect(laid.length).toBe(week.freeLiftDays.length);
        expect(laid.map((l) => l.date)).toEqual(
          week.freeLiftDays.slice(0, laid.length)
        );
      })
    );
  });

  it("names one next lift: the one under way, else the first to do", () => {
    assertProperty(
      fc.property(drawn, (d) => {
        const week = layOutWeek(build(d));
        const flagged = week.entries.filter(
          (s): s is LayoutLift => s.sport === "lift" && s.isNext
        );
        if (week.next === null) {
          expect(flagged).toEqual([]);
          expect(planLifts(week).some(toDo)).toBe(false);
          expect(week.stillToDo).toEqual([]);
        } else {
          expect(flagged).toEqual([week.next]);
          const underWay = planLifts(week).find(
            (l) => l.state === "in-progress"
          );
          if (underWay) expect(week.next).toBe(underWay);
          expect(toDo(week.next) || week.next.state === "still-to-do").toBe(
            true
          );
        }
      })
    );
  });

  it("each saved lift the plan does not hold is shown once, on its day, outside the plan", () => {
    assertProperty(
      fc.property(drawn, (d) => {
        const input = build(d);
        const week = layOutWeek(input);
        const linked = new Set(
          planLifts(week)
            .map((l) => l.savedId)
            .filter(Boolean)
        );
        const inWeek = (date: string) => date >= DAYS[0] && date <= DAYS[6];
        const days = weekDays(input.weekKey);
        const shown = (date: string) => date >= days[0] && date <= days[6];
        const expected = input.workouts
          .filter((w) => shown(w.date) && !linked.has(w.id))
          .map((w) => `${w.id}@${w.date}`)
          .sort();
        const outside = week.entries
          .filter((s): s is LayoutLift => s.sport === "lift" && !s.plan)
          .filter((l) => l.state === "done")
          .map((l) => `${l.savedId}@${l.date}`)
          .sort();
        expect(outside).toEqual(expected);
        // A plan lift done this week sits on its saved session's day.
        for (const l of planLifts(week))
          if (l.state === "done" && l.group === "day") {
            const own = input.workouts.find((w) => w.id === l.savedId);
            expect(own?.date).toBe(l.date);
            expect(inWeek(l.date!)).toBe(true);
          }
      })
    );
  });

  it("offers Start next week once every lift is done, never in race week", () => {
    assertProperty(
      fc.property(drawn, (d) => {
        const week = layOutWeek(build(d));
        const allDone = d.marks.every((m) => m.kind.startsWith("done"));
        expect(week.liftsDone).toBe(
          d.otherWeek === 0 && allDone && !d.raceWeek
        );
      })
    );
  });
});
