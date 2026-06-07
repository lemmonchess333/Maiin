/**
 * Tests for `useWorkoutDraft` — in-progress workout draft persistence.
 *
 * Focus: the uid-scoping cross-account leak fix. The pre-fix global key
 * (`tropos_workout_draft`, per-dayIndex only) leaked weights/reps/notes
 * across an account switch on a shared device. These pin:
 *   1. drafts are stored under a uid-scoped key
 *   2. account B never loads account A's draft
 *   3. the legacy un-scoped key is dropped on first read
 *   4. load is still gated per dayIndex
 *   5. clearWorkoutDraft only clears the given uid's draft
 *   6. a missing uid is a no-op (no global write)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useWorkoutDraft,
  clearWorkoutDraft,
  type WorkoutDraft,
} from "../useWorkoutDraft";

const LEGACY_KEY = "tropos_workout_draft";
const scopedKey = (uid: string) => `tropos_workout_draft:${uid}`;

function draftFor(dayIndex: number): Omit<WorkoutDraft, "savedAt"> {
  return {
    dayIndex,
    dayName: "Push",
    setLogs: [[{ reps: 5, weight: 100, completed: true, type: "working" }]],
    exerciseNotes: { 0: "felt strong" },
    elapsedSeconds: 600,
    currentExIndex: 0,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("useWorkoutDraft — uid scoping", () => {
  it("saves under a uid-scoped key, not the legacy global key", () => {
    const { result } = renderHook(() => useWorkoutDraft("user-A", 0));
    act(() => result.current.save(draftFor(0)));
    expect(window.localStorage.getItem(scopedKey("user-A"))).not.toBeNull();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("loads back the same user's draft for the matching dayIndex", () => {
    const { result } = renderHook(() => useWorkoutDraft("user-A", 0));
    act(() => result.current.save(draftFor(0)));
    const loaded = result.current.load();
    expect(loaded?.dayName).toBe("Push");
    expect(loaded?.setLogs[0][0].weight).toBe(100);
  });

  it("never loads account A's draft when mounted as account B", () => {
    // The MEDIUM finding: a shared-device account switch must not leak
    // the previous user's in-flight weights/reps/notes.
    const hookA = renderHook(() => useWorkoutDraft("user-A", 0));
    act(() => hookA.result.current.save(draftFor(0)));

    const hookB = renderHook(() => useWorkoutDraft("user-B", 0));
    expect(hookB.result.current.load()).toBeNull();
    // ...while account A still sees their own draft.
    expect(hookA.result.current.load()).not.toBeNull();
  });

  it("still gates load on dayIndex within the same user", () => {
    const { result, rerender } = renderHook(
      ({ day }) => useWorkoutDraft("user-A", day),
      { initialProps: { day: 0 } }
    );
    act(() => result.current.save(draftFor(0)));
    rerender({ day: 3 });
    expect(result.current.load()).toBeNull();
    rerender({ day: 0 });
    expect(result.current.load()).not.toBeNull();
  });

  it("drops the legacy un-scoped key on first read", () => {
    window.localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ ...draftFor(0), savedAt: Date.now() })
    );
    const { result } = renderHook(() => useWorkoutDraft("user-A", 0));
    // Loading (with no scoped draft for this uid) purges the legacy key
    // and returns null — the pre-scoping draft can never surface.
    expect(result.current.load()).toBeNull();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("clear() removes only this user's draft", () => {
    const hookA = renderHook(() => useWorkoutDraft("user-A", 0));
    const hookB = renderHook(() => useWorkoutDraft("user-B", 0));
    act(() => hookA.result.current.save(draftFor(0)));
    act(() => hookB.result.current.save(draftFor(0)));
    act(() => hookA.result.current.clear());
    expect(hookA.result.current.load()).toBeNull();
    expect(hookB.result.current.load()).not.toBeNull();
  });

  it("is a no-op without a uid (no global write / load)", () => {
    const { result } = renderHook(() => useWorkoutDraft(undefined, 0));
    act(() => result.current.save(draftFor(0)));
    expect(result.current.load()).toBeNull();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });
});

describe("clearWorkoutDraft (non-hook, sign-out path)", () => {
  it("clears the given uid's scoped draft", () => {
    window.localStorage.setItem(
      scopedKey("user-A"),
      JSON.stringify({ ...draftFor(0), savedAt: Date.now() })
    );
    clearWorkoutDraft("user-A");
    expect(window.localStorage.getItem(scopedKey("user-A"))).toBeNull();
  });

  it("no-ops on a missing uid", () => {
    expect(() => clearWorkoutDraft("")).not.toThrow();
  });
});
