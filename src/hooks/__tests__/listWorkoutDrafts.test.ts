/**
 * The screens outside the workout (Home's and Train's In progress strip)
 * read every draft on the phone, and keep the ones a session could
 * resume (`resumableLift`). This pins the reader: the account's own
 * drafts, newest first, with finished sessions waiting for the server
 * left out.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useWorkoutDraft,
  computeDraftIdentity,
  draftLayout,
  listWorkoutDrafts,
  type WorkoutDraft,
  type DraftIdentityParts,
} from "../useWorkoutDraft";

function identity(overrides: Partial<DraftIdentityParts> = {}): string {
  return computeDraftIdentity({
    scope: "programme",
    epoch: 1,
    dayIndex: 0,
    dayName: "Push",
    layout: [{ id: "bench-press", sets: 3 }],
    ...overrides,
  });
}

function draft(
  dayIndex: number,
  extra: Partial<WorkoutDraft> = {}
): Omit<WorkoutDraft, "savedAt" | "identity"> {
  return {
    dayIndex,
    dayName: "Push",
    setLogs: [[{ reps: 5, weight: 100, completed: true, type: "working" }]],
    exerciseNotes: {},
    elapsedSeconds: 600,
    currentExIndex: 0,
    completionId: `c${dayIndex}`,
    completionCommandId: `c${dayIndex}`,
    ...extra,
  };
}

function save(
  uid: string,
  dayIndex: number,
  id: string,
  extra: Partial<WorkoutDraft> = {}
) {
  const { result } = renderHook(() => useWorkoutDraft(uid, dayIndex, id));
  act(() => {
    result.current.save(draft(dayIndex, extra));
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("listWorkoutDrafts", () => {
  it("lists the account's drafts newest first", () => {
    const push = identity();
    const pull = identity({ dayIndex: 1, dayName: "Pull" });
    save("user-A", 0, push);
    save("user-A", 1, pull);
    const listed = listWorkoutDrafts("user-A");
    expect(listed.map((d) => d.identity).sort()).toEqual([push, pull].sort());
    expect(listed[0].savedAt).toBeGreaterThanOrEqual(listed[1].savedAt);
  });

  it("leaves out a finished session waiting for the server, and other accounts", () => {
    save("user-A", 2, identity({ dayIndex: 2 }), { completionPending: true });
    save("user-B", 0, identity());
    expect(listWorkoutDrafts("user-A")).toEqual([]);
    expect(listWorkoutDrafts("user-B")).toHaveLength(1);
    expect(listWorkoutDrafts("")).toEqual([]);
  });
});

describe("draftLayout", () => {
  it("records each exercise by its id, or its name when it has none", () => {
    expect(
      draftLayout([
        { exerciseId: "bench-press", name: "Bench Press", sets: 3 },
        { exerciseId: "", name: "Custom row", sets: 2 },
      ])
    ).toEqual([
      { id: "bench-press", sets: 3 },
      { id: "Custom row", sets: 2 },
    ]);
  });
});
