import { describe, it, expect } from "vitest";
import { liftCompletionContext } from "../completionPlanContext";
import type { ProgramState } from "@/features/program/programTypes";

/**
 * The line under Done on the finish screen: which lift comes next, named
 * the way every other lift surface names it (DS3), not as the raw stored
 * "Push — Chest Focus". The week's count is the "Your week so far" card
 * under it, so the line does not repeat it.
 */
function state(
  workouts: Array<{ dayName: string; completed?: boolean; skipped?: boolean }>,
  over: Partial<ProgramState> = {}
): ProgramState {
  return {
    weekNumber: 1,
    workouts: workouts.map((w) => ({ completed: false, ...w })),
    ...over,
  } as unknown as ProgramState;
}

describe("liftCompletionContext", () => {
  const week = [
    { dayName: "Pull — Lat Focus" },
    { dayName: "Push — Chest Focus" },
    { dayName: "Legs — Squat Focus" },
  ];

  it("names the next lift as the other screens do, and nothing else", () => {
    const context = liftCompletionContext(state(week), 0);
    expect(context).toEqual({ next: "Next: Push" });
  });

  it("follows a chosen next lift, and skips skipped and done days", () => {
    const withOverride = liftCompletionContext(
      state(week, { nextWorkoutOverride: 2 }),
      0
    );
    expect(withOverride.next).toBe("Next: Legs");
    const skipped = liftCompletionContext(
      state([week[0], { ...week[1], skipped: true }, week[2]]),
      0
    );
    expect(skipped.next).toBe("Next: Legs");
  });

  it("letters the next lift when its week holds another of its type", () => {
    const sixDays = state([
      { dayName: "Push — Chest Focus", completed: true },
      { dayName: "Pull — Lat Focus", completed: true },
      { dayName: "Legs — Squat Focus", completed: true },
      { dayName: "Push — Shoulder Focus" },
      { dayName: "Pull — Row Focus" },
      { dayName: "Legs — Deadlift Focus" },
    ]);
    expect(liftCompletionContext(sixDays, 2).next).toBe("Next: Push B");
  });

  it("says so when every planned lift is done", () => {
    const context = liftCompletionContext(
      state([week[0], { ...week[1], completed: true }]),
      0
    );
    expect(context.next).toBe(
      "All planned lifts complete. Review your week on Train."
    );
  });
});
