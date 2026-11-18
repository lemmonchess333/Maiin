import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { assertProperty } from "@/test/property";
import { EXERCISES } from "@/lib/exercises";
import { nextUpIndex } from "../nextUpCursor";
import {
  AUTOMATIC_STEP_SHARE,
  automaticStepUp,
  loadGridFor,
  loweredLoad,
  stretchedRepCeiling,
  type LoadGrid,
} from "../loadSteps";
import { restSecondsFor, suggestedRestSeconds } from "../restTime";
import type { LiftUnit } from "@/lib/liftLoad";
import type { WorkoutDay } from "../programTypes";

/**
 * Programme invariants as properties: the next-up cursor (ADR-0002), the
 * weight grids every prescribed load lands on (Lift4 (6), Lift18), and the
 * rest a set gets (Lift4 (5)).
 */

const EPS = 1e-6;

describe("nextUpIndex", () => {
  const day = fc.record({
    completed: fc.boolean(),
    skipped: fc.boolean(),
  });

  it("is the chosen lift while it is still to do, else the first to do, else -1", () => {
    assertProperty(
      fc.property(
        fc.array(day, { maxLength: 8 }),
        fc.option(fc.integer({ min: -1, max: 9 }), { nil: undefined }),
        fc.option(fc.integer({ min: 0, max: 8 }), { nil: undefined }),
        (marks, chosen, passing) => {
          const workouts = marks as unknown as WorkoutDay[];
          const toDo = (i: number) =>
            !!marks[i] &&
            !marks[i].completed &&
            !marks[i].skipped &&
            i !== passing;
          const naive =
            chosen !== undefined && toDo(chosen)
              ? chosen
              : marks.findIndex((_, i) => toDo(i));
          const index = nextUpIndex(
            { workouts, nextWorkoutOverride: chosen },
            passing
          );
          expect(index).toBe(naive);
          if (index >= 0) expect(toDo(index)).toBe(true);
          else expect(marks.some((_, i) => toDo(i))).toBe(false);
        }
      )
    );
  });
});

describe("weight grids", () => {
  const byEquipment = (equipment: string) =>
    EXERCISES.find((e) => e.equipment === equipment)?.id;
  const kinds = [
    "Barbell",
    "Dumbbells",
    "Kettlebell",
    "Machine",
    "Cable Machine",
    "Bodyweight",
  ].map((equipment) => {
    const id = byEquipment(equipment);
    if (!id) throw new Error(`No ${equipment} lift in the catalogue`);
    return id;
  });

  /** Every grid a lift's load can move on: each kit, small plates or not,
   *  in kg and in lb. */
  const grid: fc.Arbitrary<{ grid: LoadGrid; label: string }> = fc
    .tuple(
      fc.constantFrom(...kinds),
      fc.boolean(),
      fc.constantFrom<LiftUnit>("kg", "lbs")
    )
    .map(([id, small, unit]) => ({
      grid: loadGridFor(id, small, unit),
      label: `${id} ${small ? "small plates" : ""} ${unit}`,
    }));
  /** Any weight, and whole kilos, where a light lift's steps are a large
   *  share of it (fast-check's doubles crowd near the ends). */
  const weight = fc.oneof(
    fc.double({ min: 0, max: 300, noNaN: true }),
    fc.integer({ min: 1, max: 300 })
  );

  it("the next weight up is heavier, the next down lighter and never below 0", () => {
    assertProperty(
      fc.property(grid, weight, ({ grid: g }, w) => {
        expect(g.above(w)).toBeGreaterThan(w);
        expect(g.below(w)).toBeLessThan(w + EPS);
        expect(g.below(w)).toBeGreaterThanOrEqual(0);
      })
    );
  });

  it("the nearest weight is on the grid: nearest again is itself, and one up then one down returns to it", () => {
    assertProperty(
      fc.property(grid, weight, ({ grid: g }, w) => {
        const n = g.nearest(w);
        expect(Math.abs(g.nearest(n) - n)).toBeLessThan(EPS);
        expect(Math.abs(g.below(g.above(n)) - n)).toBeLessThan(EPS);
      })
    );
  });

  it("the nearest weight is no further than the next one up or down", () => {
    assertProperty(
      fc.property(grid, weight, ({ grid: g }, w) => {
        const gap = Math.abs(g.nearest(w) - w);
        expect(gap).toBeLessThanOrEqual(Math.abs(g.above(w) - w) + EPS);
        const down = g.below(w);
        if (down > 0) expect(gap).toBeLessThanOrEqual(Math.abs(down - w) + EPS);
      })
    );
  });

  it("an automatic step is the next weight up and no more than 15% heavier", () => {
    assertProperty(
      fc.property(grid, weight, ({ grid: g }, drawnWeight) => {
        // A plan's weight is on its grid.
        const w = g.nearest(drawnWeight);
        const up = automaticStepUp(g, w);
        if (up === null) {
          expect(g.above(w) - w).toBeGreaterThan(w * AUTOMATIC_STEP_SHARE);
          return;
        }
        expect(up).toBe(g.above(w));
        expect(up - w).toBeLessThanOrEqual(w * AUTOMATIC_STEP_SHARE + EPS);
      })
    );
  });

  it("a lowered load is at least one step lighter, and on the grid", () => {
    assertProperty(
      fc.property(grid, weight, ({ grid: g }, w) => {
        const n = g.nearest(w);
        const lower = loweredLoad(g, n);
        expect(lower).toBeLessThanOrEqual(g.below(n) + EPS);
        expect(lower).toBeGreaterThanOrEqual(0);
        if (lower > 0)
          expect(Math.abs(g.nearest(lower) - lower)).toBeLessThan(EPS);
      })
    );
  });
});

describe("stretchedRepCeiling", () => {
  it("is never under the range's bottom, and a lighter weight never gets fewer reps", () => {
    assertProperty(
      fc.property(
        fc.double({ min: 2, max: 200, noNaN: true }),
        // Past 1 the weight is heavier than "next": outside the plan's use,
        // and still never under the bottom.
        fc.double({ min: 0.5, max: 1.3, noNaN: true }),
        fc.double({ min: 0.5, max: 1.3, noNaN: true }),
        fc.integer({ min: 1, max: 20 }),
        (next, shareA, shareB, bottom) => {
          const [lighter, heavier] = [
            next * Math.min(shareA, shareB),
            next * Math.max(shareA, shareB),
          ];
          const light = stretchedRepCeiling(lighter, next, bottom);
          const heavy = stretchedRepCeiling(heavier, next, bottom);
          expect(heavy).toBeGreaterThanOrEqual(bottom);
          expect(Number.isInteger(heavy)).toBe(true);
          expect(light).toBeGreaterThanOrEqual(heavy);
        }
      )
    );
  });
});

describe("rest between sets", () => {
  const lift = fc.record({
    exerciseId: fc.constantFrom(...EXERCISES.slice(0, 60).map((e) => e.id)),
    reps: fc.integer({ min: 1, max: 20 }),
    isAccessory: fc.boolean(),
    repUnit: fc.constantFrom<"reps" | "seconds" | undefined>(
      "reps",
      "seconds",
      undefined
    ),
  });

  it("a short-session plan never rests longer than a full one", () => {
    assertProperty(
      fc.property(lift, fc.integer({ min: 5, max: 30 }), (ex, minutes) => {
        expect(suggestedRestSeconds(ex, minutes)).toBeLessThanOrEqual(
          suggestedRestSeconds(ex)
        );
        expect(suggestedRestSeconds(ex, minutes)).toBeGreaterThan(0);
      })
    );
  });

  it("a rest the person fixed wins, then a rest the template wrote", () => {
    assertProperty(
      fc.property(
        lift,
        fc.integer({ min: 1, max: 600 }),
        fc.integer({ min: 1, max: 600 }),
        fc.option(fc.integer({ min: 5, max: 120 }), { nil: undefined }),
        (ex, fixed, template, minutes) => {
          expect(
            restSecondsFor(
              { ...ex, restSeconds: template },
              { fixedRest: fixed, sessionMinutes: minutes }
            )
          ).toBe(fixed);
          expect(
            restSecondsFor(
              { ...ex, restSeconds: template },
              { sessionMinutes: minutes }
            )
          ).toBe(template);
        }
      )
    );
  });
});
