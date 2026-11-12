/**
 * Lift21's acceptance, as Pgm9 asks for it: the week a new plan holds, for
 * every setup of the panel, checked both ways. No day runs past its length
 * and none is left short of it while it has more to give; and the shape the
 * decision asked for holds: fewer lifts when time is short, never thinner
 * ones.
 *
 * `TROPOS_PANEL_OUT=<file> npx vitest run sessionSizing` writes the panel's
 * weeks to a file, which is how a pull request prints them beside main's.
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { exerciseRole } from "../exerciseRole";
import { estimateSessionSeconds } from "../expressSession";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import type { PrimaryGoal, WorkoutDay } from "../programTypes";
import { FLOOR_DEADLIFT_IDS } from "../roleTable";
import { pairedWithNext } from "../pairSlot";
import { FIT_TOLERANCE, sessionFits } from "../sessionFit";

const DAYS = [2, 3, 4, 5, 6] as const;
const MINUTES = [30, 45, 60, 75] as const;
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const GOALS: PrimaryGoal[] = ["hypertrophy", "general", "strength"];

interface Setup {
  days: number;
  minutes: number;
  level: (typeof LEVELS)[number];
  goal: PrimaryGoal;
}

const SETUPS: Setup[] = DAYS.flatMap((days) =>
  MINUTES.flatMap((minutes) =>
    LEVELS.flatMap((level) =>
      GOALS.map((goal) => ({ days, minutes, level, goal }))
    )
  )
);

const tag = (s: Setup) =>
  `${String(s.days)} days, ${String(s.minutes)} min, ${s.level}, ${s.goal}`;

const weeks = new Map<string, WorkoutDay[]>();
function weekOf(s: Setup): WorkoutDay[] {
  let week = weeks.get(tag(s));
  if (!week) {
    week = buildPlan({
      primaryGoal: s.goal,
      nutritionPhase: "recomp",
      experience: s.level,
      sessionMinutes: s.minutes,
      bodyweightKg: 80,
      sex: "male",
      liftDays: s.days,
      preferredSplit: "auto",
      runMode: "freeform",
      weeklyRunDays: 0,
      equipment: "full_gym",
      injuries: [],
      currentDate: "2026-11-09",
    } as PlanBuilderInput).programState.workouts;
    weeks.set(tag(s), week);
  }
  return week;
}

const secondsOf = (day: WorkoutDay, minutes: number) =>
  estimateSessionSeconds(day.exercises, { sessionMinutes: minutes });
const setsOf = (day: WorkoutDay) =>
  day.exercises.reduce((n, e) => n + e.sets, 0);

/** One day as a line of the print: `*` marks a main lift. */
function line(day: WorkoutDay, minutes: number): string {
  const lifts = day.exercises
    .map(
      (e) =>
        `${e.name} ${String(e.sets)}x${String(e.reps)}${e.repRangeMax ? `-${String(e.repRangeMax)}` : ""}${e.isAccessory ? "" : "*"}`
    )
    .join(", ");
  return `  ${day.dayName} | ${String(day.exercises.length)} lifts | ${String(setsOf(day))} sets | ${String(Math.round(secondsOf(day, minutes) / 60))} min | ${lifts}`;
}

describe("a new plan's week, for every setup of the panel (Lift21)", () => {
  it("prints, when asked", () => {
    const out = process.env.TROPOS_PANEL_OUT;
    if (!out) return;
    writeFileSync(
      out,
      SETUPS.flatMap((s) => [
        `\n== ${tag(s)}`,
        ...weekOf(s).map((d) => line(d, s.minutes)),
      ]).join("\n")
    );
  });

  it("has no day over its length", () => {
    const over = SETUPS.flatMap((s) =>
      weekOf(s)
        .filter((d) => !sessionFits(d.exercises, s.minutes))
        .map((d) => `${tag(s)}: ${d.dayName}`)
    );
    expect(over).toEqual([]);
    // …on the plan's own price, and on the card's estimate too.
    for (const s of SETUPS)
      for (const d of weekOf(s))
        expect(
          secondsOf(d, s.minutes),
          `${tag(s)}: ${d.dayName}`
        ).toBeLessThanOrEqual(s.minutes * 60 * (1 + FIT_TOLERANCE));
  });

  it("has no day short of its length", () => {
    // Past beginner every day prices at 85% of its length or more.
    for (const s of SETUPS.filter((x) => x.level !== "beginner"))
      for (const d of weekOf(s))
        expect(
          secondsOf(d, s.minutes),
          `${tag(s)}: ${d.dayName}`
        ).toBeGreaterThanOrEqual(s.minutes * 60 * 0.85);
    // A beginner's can end sooner: three sets a lift is their most, and
    // the plan prices each lift's warm-up as it will be once the lift is
    // established (`sessionFit.ts`), which their first weeks' are not.
    for (const s of SETUPS.filter((x) => x.level === "beginner"))
      for (const d of weekOf(s))
        expect(
          secondsOf(d, s.minutes),
          `${tag(s)}: ${d.dayName}`
        ).toBeGreaterThanOrEqual(s.minutes * 60 * 0.6);
  });

  it("gives no lift under three sets past beginner, but in a half-hour day", () => {
    const thin = SETUPS.filter(
      (s) => s.level !== "beginner" && s.minutes > 30
    ).flatMap((s) =>
      weekOf(s).flatMap((d) =>
        d.exercises
          .filter((e) => e.repUnit !== "seconds" && e.sets < 3)
          .map(
            (e) => `${tag(s)}: ${d.dayName}: ${e.exerciseId} ${String(e.sets)}`
          )
      )
    );
    expect(thin).toEqual([]);
  });

  it("gives a beginner three sets on a main lift and two or three elsewhere", () => {
    for (const s of SETUPS.filter((x) => x.level === "beginner"))
      for (const d of weekOf(s))
        for (const e of d.exercises) {
          if (e.repUnit === "seconds") continue;
          const at = `${tag(s)}: ${d.dayName}: ${e.exerciseId}`;
          expect(e.sets, at).toBeGreaterThanOrEqual(2);
          expect(e.sets, at).toBeLessThanOrEqual(3);
        }
  });

  it("keeps the days of one kind the same size, within a lift", () => {
    const uneven = SETUPS.flatMap((s) => {
      const byType = new Map<string, number[]>();
      for (const d of weekOf(s))
        byType.set(d.dayType, [
          ...(byType.get(d.dayType) ?? []),
          d.exercises.length,
        ]);
      return [...byType]
        .filter(([, n]) => Math.max(...n) - Math.min(...n) > 1)
        .map(([type, n]) => `${tag(s)}: ${type} days hold ${n.join(" and ")}`);
    });
    expect(uneven).toEqual([]);
  });

  it("holds more, never less, with more time", () => {
    for (const days of DAYS)
      for (const level of LEVELS)
        for (const goal of GOALS) {
          const totals = MINUTES.map((minutes) => {
            const week = weekOf({ days, minutes, level, goal });
            return {
              lifts: week.reduce((n, d) => n + d.exercises.length, 0),
              sets: week.reduce((n, d) => n + setsOf(d), 0),
            };
          });
          for (let i = 1; i < totals.length; i++) {
            const at = `${String(days)} days, ${level}, ${goal}: ${String(MINUTES[i - 1])} to ${String(MINUTES[i])} min`;
            expect(totals[i].lifts, at).toBeGreaterThanOrEqual(
              totals[i - 1].lifts
            );
            expect(totals[i].sets, at).toBeGreaterThanOrEqual(
              totals[i - 1].sets
            );
          }
        }
  });

  it("holds the lifts an intermediate's time buys: three to five at 45 minutes, four or five at an hour", () => {
    for (const s of SETUPS.filter(
      (x) => x.level !== "beginner" && x.days >= 4
    )) {
      const counts = weekOf(s).map((d) => d.exercises.length);
      const at = `${tag(s)}: ${counts.join(",")}`;
      const [fewest, most] =
        s.minutes === 30
          ? [2, 4]
          : s.minutes === 45
            ? // Lift22: two pairs give a day back a lift.
              [3, 5]
            : s.minutes === 60
              ? [4, 5]
              : [5, 6];
      expect(Math.min(...counts), at).toBeGreaterThanOrEqual(fewest);
      expect(Math.max(...counts), at).toBeLessThanOrEqual(most);
    }
  });

  it("leads each half of the body with one main lift a day", () => {
    const lower = new Set(["knee_dominant", "hip_dominant"]);
    for (const s of SETUPS.filter((x) => x.level !== "beginner"))
      for (const d of weekOf(s)) {
        const mains = d.exercises.filter((e) => e.isAccessory !== true);
        const halves = mains.map((e) => lower.has(e.movementCategory));
        expect(
          new Set(halves).size,
          `${tag(s)}: ${d.dayName}: ${mains.map((e) => e.exerciseId).join(", ")}`
        ).toBe(halves.length);
      }
  });

  it("pulls the deadlift from the floor on one day a week past beginner, for three sets", () => {
    for (const s of SETUPS.filter((x) => x.level !== "beginner")) {
      const deadlifts = weekOf(s)
        .flatMap((d) => d.exercises)
        .filter((e) => FLOOR_DEADLIFT_IDS.includes(e.exerciseId));
      expect(deadlifts.length, tag(s)).toBeLessThanOrEqual(1);
      for (const e of deadlifts) {
        expect(e.sets, tag(s)).toBeLessThanOrEqual(3);
        expect(e.reps, tag(s)).toBeLessThanOrEqual(5);
      }
    }
  });

  it("pulls about as much as it presses (D-LIFT-3)", () => {
    // Compound lifts, by movement: a lateral raise is no press and a face
    // pull no row. No pass adds pulling sets to a built week, so the
    // builders' order and the first pull's sets are what keep this.
    const sets = (week: WorkoutDay[], categories: string[]) =>
      week
        .flatMap((d) => d.exercises)
        .filter(
          (e) =>
            categories.includes(e.movementCategory) &&
            exerciseRole(e) !== "isolation"
        )
        .reduce((n, e) => n + e.sets, 0);
    for (const s of SETUPS) {
      const week = weekOf(s);
      const push = sets(week, ["horizontal_push", "vertical_push"]);
      const pull = sets(week, ["horizontal_pull", "vertical_pull"]);
      const at = `${tag(s)}: pull ${String(pull)}, push ${String(push)}`;
      expect(pull, at).toBeGreaterThan(0);
      if (s.minutes >= 45) expect(pull, at).toBeGreaterThanOrEqual(push * 0.7);
    }
  });
});

describe("the order a day gives its lifts up in", () => {
  // A pair the plan wrote reads "a 3 + b 3" (Lift22).
  const shape = (week: WorkoutDay[]) =>
    week.map(
      (d) =>
        `${d.dayName}: ${d.exercises
          .map(
            (e, i) =>
              `${e.exerciseId} ${String(e.sets)}${pairedWithNext(d.exercises, i) ? " +" : ","}`
          )
          .join(" ")
          .replace(/,$/, "")}`
    );
  const sixDays = (minutes: number) =>
    shape(weekOf({ days: 6, minutes, level: "intermediate", goal: "general" }));

  // Lift21's first reference: six days of General fitness, the week the
  // decision was taken on. Written out so a change to a rank or to the
  // sizing shows as a changed week, not only as a count.
  // Lift22: the time a 45-minute day's pairs save goes to the lifts it
  // had given up, in its own order, and then to sets.
  it("keeps each day's first pieces at 45 minutes, its last ones paired", () => {
    expect(sixDays(45)).toEqual([
      "Pull — Lat Focus: pull-ups 4, barbell-row 4, db-curl 3 + face-pulls 3",
      "Push — Chest Focus: bench-press 4, overhead-press 4, rope-tricep-pushdown 3 + lateral-raise 3",
      "Legs — Squat Focus: squat 4, romanian-deadlift 3, hack-squat 3 + standing-calf-raise 3",
      "Pull — Row Focus: barbell-row 4, lat-pulldown 4, db-curl 3 + reverse-flyes 3",
      "Push — Shoulder Focus: overhead-press 3, db-bench 3, db-shoulder-press 3, rope-tricep-pushdown 3 + lateral-raise 3",
      "Legs — Deadlift Focus: deadlift 3, squat 3, seated-leg-curl 3 + cable-crunch 3",
    ]);
  });

  it("adds a fifth lift and the main lift's fourth set at an hour", () => {
    expect(sixDays(60)).toEqual([
      "Pull — Lat Focus: pull-ups 4, barbell-row 4, lat-pulldown 3, db-curl 4, face-pulls 3",
      "Push — Chest Focus: bench-press 4, overhead-press 4, db-bench 3, rope-tricep-pushdown 4, lateral-raise 3",
      "Legs — Squat Focus: squat 4, romanian-deadlift 4, hack-squat 3, standing-calf-raise 3, seated-leg-curl 3",
      "Pull — Row Focus: barbell-row 4, lat-pulldown 4, seated-row 3, db-curl 4, reverse-flyes 3",
      "Push — Shoulder Focus: overhead-press 4, db-bench 4, db-shoulder-press 4, rope-tricep-pushdown 3, lateral-raise 3",
      "Legs — Deadlift Focus: deadlift 3, squat 3, seated-leg-curl 3, hack-squat 3, cable-crunch 3",
    ]);
  });

  it("leaves no rank on a built plan", () => {
    for (const s of SETUPS)
      for (const d of weekOf(s))
        for (const e of d.exercises)
          expect("keepRank" in e, `${tag(s)}: ${e.exerciseId}`).toBe(false);
  });
});
