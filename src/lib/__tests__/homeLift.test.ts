import { describe, it, expect } from "vitest";
import { nextLiftAfter, resolveHomeLift } from "../homeLift";
import type { ResolvedLift } from "@/lib/trainingResolver";
import type { WorkoutDay } from "@/features/program/programTypes";

const day = (dayName: string, extra: Partial<WorkoutDay> = {}): WorkoutDay => ({
  dayName,
  dayType: "full",
  exercises: [],
  completed: false,
  ...extra,
});

const scheduled = (
  index: number | null,
  workouts: WorkoutDay[]
): ResolvedLift => ({
  index,
  workout: index === null ? null : workouts[index],
  status: "planned",
  isTerminal: false,
  isStartable: index !== null,
});

describe("resolveHomeLift", () => {
  const plan = [day("A"), day("B"), day("C"), day("D")];

  it("offers the programme's next workout, not the weekday's", () => {
    // A Friday sign-up: the weekday maps to D, the programme starts at A.
    const lift = resolveHomeLift({
      scheduled: scheduled(3, plan),
      workouts: plan,
      sessionsToday: new Set(),
    });
    expect(lift.workout?.dayName).toBe("A");
    expect(lift.index).toBe(0);
    expect(lift.isStartable).toBe(true);
  });

  it("keeps a workout finished today on the card, done", () => {
    const done = [
      day("A", { completed: true, completedWorkoutId: "w1" }),
      ...plan.slice(1),
    ];
    const lift = resolveHomeLift({
      scheduled: scheduled(3, done),
      workouts: done,
      sessionsToday: new Set(["w1"]),
    });
    expect(lift.workout?.dayName).toBe("A");
    expect(lift.status).toBe("completed");
    expect(lift.isStartable).toBe(false);
  });

  it("offers the next one when the done workout was finished on another day", () => {
    const done = [
      day("A", { completed: true, completedWorkoutId: "w1" }),
      ...plan.slice(1),
    ];
    const lift = resolveHomeLift({
      scheduled: scheduled(0, done),
      workouts: done,
      sessionsToday: new Set(),
    });
    expect(lift.workout?.dayName).toBe("B");
  });

  it("skips a skipped workout", () => {
    const skipped = [day("A", { skipped: true }), ...plan.slice(1)];
    const lift = resolveHomeLift({
      scheduled: scheduled(1, skipped),
      workouts: skipped,
      sessionsToday: new Set(),
    });
    expect(lift.workout?.dayName).toBe("B");
  });

  it("is not a lift day when the schedule says not", () => {
    const rest = scheduled(null, plan);
    expect(
      resolveHomeLift({
        scheduled: rest,
        workouts: plan,
        sessionsToday: new Set(),
      })
    ).toBe(rest);
  });

  it("falls back to the weekday's slot once the week is all done", () => {
    const all = plan.map((w) => ({ ...w, completed: true }));
    const slot = { ...scheduled(2, all), status: "completed" as const };
    expect(
      resolveHomeLift({
        scheduled: slot,
        workouts: all,
        sessionsToday: new Set(),
      })
    ).toBe(slot);
  });
});

describe("nextLiftAfter", () => {
  const plan = [day("A"), day("B"), day("C")];

  it("is the one after today's while today's is still to do", () => {
    const today = resolveHomeLift({
      scheduled: scheduled(0, plan),
      workouts: plan,
      sessionsToday: new Set(),
    });
    expect(nextLiftAfter(today, plan)?.workout.dayName).toBe("B");
  });

  it("is the next undone one once today's is done", () => {
    const done = [
      day("A", { completed: true, completedWorkoutId: "w1" }),
      ...plan.slice(1),
    ];
    const today = resolveHomeLift({
      scheduled: scheduled(0, done),
      workouts: done,
      sessionsToday: new Set(["w1"]),
    });
    expect(nextLiftAfter(today, done)?.workout.dayName).toBe("B");
  });

  it("is null when nothing is left", () => {
    const all = plan.map((w) => ({ ...w, completed: true }));
    expect(nextLiftAfter(scheduled(0, all), all)).toBeNull();
  });
});
