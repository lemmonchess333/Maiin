import { describe, it, expect } from "vitest";
import { liftCompletionContext } from "../completionPlanContext";
import type { ProgramState } from "@/features/program/programTypes";

/**
 * The two lines under Done on the finish screen: where the week stands and
 * which lift comes next. The next day is named the way every other lift
 * surface names it (DS3), not as the raw stored "Push — Chest Focus".
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

  it("names the next lift as the other screens do", () => {
    const context = liftCompletionContext(state(week), 0, "2026-09-27");
    expect(context.next).toBe("Next: Push · Chest focus");
    expect(context.progress).toBe(
      "Week 1 of 4 · 1 of 3 planned lifts complete"
    );
  });

  it("follows a chosen next lift, and skips skipped and done days", () => {
    const withOverride = liftCompletionContext(
      state(week, { nextWorkoutOverride: 2 }),
      0,
      "2026-09-27"
    );
    expect(withOverride.next).toBe("Next: Legs · Squat focus");
    const skipped = liftCompletionContext(
      state([week[0], { ...week[1], skipped: true }, week[2]]),
      0,
      "2026-09-27"
    );
    expect(skipped.next).toBe("Next: Legs · Squat focus");
  });

  it("says so when every planned lift is done", () => {
    const context = liftCompletionContext(
      state([week[0], { ...week[1], completed: true }]),
      0,
      "2026-09-27"
    );
    expect(context.next).toBe(
      "All planned lifts complete — review your week on Train"
    );
  });
});
