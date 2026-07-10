/**
 * Tests for `useWorkoutDraft` — in-progress workout draft persistence.
 *
 * Two protected invariants:
 *
 * 1. uid scoping (PR #820 class): the pre-fix global key
 *    (`tropos_workout_draft`, per-dayIndex only) leaked
 *    weights/reps/notes across an account switch on a shared device.
 * 2. LIFT-01 session identity: a draft was previously matched by
 *    uid + dayIndex alone, so a rebuilt/customised programme day, a
 *    new programme week, or a different saved routine (all routines
 *    shared synthetic dayIndex -1) could restore a stale draft's
 *    POSITIONAL setLogs/notes onto the wrong exercises. A draft now
 *    carries a deterministic identity (scope + epoch + day metadata +
 *    exercise layout) and only resumes on an exact match; legacy
 *    drafts without an identity are dropped on read.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useWorkoutDraft,
  clearWorkoutDraft,
  computeDraftIdentity,
  type WorkoutDraft,
  type DraftIdentityParts,
} from "../useWorkoutDraft";

const LEGACY_KEY = "tropos_workout_draft";
const scopedKey = (uid: string) => `tropos_workout_draft:${uid}`;

function identityParts(
  overrides: Partial<DraftIdentityParts> = {}
): DraftIdentityParts {
  return {
    scope: "programme",
    epoch: 1,
    dayIndex: 0,
    dayName: "Push",
    layout: [
      { id: "bench-press", sets: 3 },
      { id: "overhead-press", sets: 3 },
    ],
    ...overrides,
  };
}

const IDENTITY = computeDraftIdentity(identityParts());

function draftFor(
  dayIndex: number
): Omit<WorkoutDraft, "savedAt" | "identity"> {
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
    const { result } = renderHook(() => useWorkoutDraft("user-A", 0, IDENTITY));
    act(() => result.current.save(draftFor(0)));
    expect(window.localStorage.getItem(scopedKey("user-A"))).not.toBeNull();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("loads back the same user's draft for the matching session", () => {
    const { result } = renderHook(() => useWorkoutDraft("user-A", 0, IDENTITY));
    act(() => result.current.save(draftFor(0)));
    const loaded = result.current.load();
    expect(loaded?.dayName).toBe("Push");
    expect(loaded?.setLogs[0][0].weight).toBe(100);
  });

  it("never loads account A's draft when mounted as account B", () => {
    // The MEDIUM finding: a shared-device account switch must not leak
    // the previous user's in-flight weights/reps/notes.
    const hookA = renderHook(() => useWorkoutDraft("user-A", 0, IDENTITY));
    act(() => hookA.result.current.save(draftFor(0)));

    const hookB = renderHook(() => useWorkoutDraft("user-B", 0, IDENTITY));
    expect(hookB.result.current.load()).toBeNull();
    // ...while account A still sees their own draft.
    expect(hookA.result.current.load()).not.toBeNull();
  });

  it("still gates load on dayIndex within the same user", () => {
    const identityForDay = (day: number) =>
      computeDraftIdentity(identityParts({ dayIndex: day }));
    const { result, rerender } = renderHook(
      ({ day }) => useWorkoutDraft("user-A", day, identityForDay(day)),
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
    const { result } = renderHook(() => useWorkoutDraft("user-A", 0, IDENTITY));
    // Loading (with no scoped draft for this uid) purges the legacy key
    // and returns null — the pre-scoping draft can never surface.
    expect(result.current.load()).toBeNull();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("clear() removes only this user's draft", () => {
    const hookA = renderHook(() => useWorkoutDraft("user-A", 0, IDENTITY));
    const hookB = renderHook(() => useWorkoutDraft("user-B", 0, IDENTITY));
    act(() => hookA.result.current.save(draftFor(0)));
    act(() => hookB.result.current.save(draftFor(0)));
    act(() => hookA.result.current.clear());
    expect(hookA.result.current.load()).toBeNull();
    expect(hookB.result.current.load()).not.toBeNull();
  });

  it("is a no-op without a uid (no global write / load)", () => {
    const { result } = renderHook(() =>
      useWorkoutDraft(undefined, 0, IDENTITY)
    );
    act(() => result.current.save(draftFor(0)));
    expect(result.current.load()).toBeNull();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });
});

describe("useWorkoutDraft — LIFT-01 session identity", () => {
  it("does not resume when the same day's exercise layout changed", () => {
    // The core LIFT-01 failure: rebuild/customise the programme so the
    // same dayIndex has a different exercise layout — the positional
    // setLogs from the old layout must NOT be offered for resume.
    const before = renderHook(() => useWorkoutDraft("user-A", 0, IDENTITY));
    act(() => before.result.current.save(draftFor(0)));

    const rebuilt = computeDraftIdentity(
      identityParts({
        layout: [
          { id: "incline-bench-press", sets: 3 },
          { id: "overhead-press", sets: 3 },
        ],
      })
    );
    const after = renderHook(() => useWorkoutDraft("user-A", 0, rebuilt));
    expect(after.result.current.load()).toBeNull();
  });

  it("does not resume when a set count changed within the same exercises", () => {
    const before = renderHook(() => useWorkoutDraft("user-A", 0, IDENTITY));
    act(() => before.result.current.save(draftFor(0)));

    const resized = computeDraftIdentity(
      identityParts({
        layout: [
          { id: "bench-press", sets: 4 },
          { id: "overhead-press", sets: 3 },
        ],
      })
    );
    const after = renderHook(() => useWorkoutDraft("user-A", 0, resized));
    expect(after.result.current.load()).toBeNull();
  });

  it("does not resume across a programme-week advancement", () => {
    // Same day, same layout, next weekNumber: last week's in-flight
    // draft must not claim this week's session (completed sets would
    // be attributed to work never done this week).
    const week1 = renderHook(() =>
      useWorkoutDraft("user-A", 0, computeDraftIdentity(identityParts()))
    );
    act(() => week1.result.current.save(draftFor(0)));

    const week2Identity = computeDraftIdentity(identityParts({ epoch: 2 }));
    const week2 = renderHook(() => useWorkoutDraft("user-A", 0, week2Identity));
    expect(week2.result.current.load()).toBeNull();
  });

  it("isolates saved routines from each other (shared dayIndex -1)", () => {
    // Pre-LIFT-01, every saved routine shared the synthetic -1 slot,
    // so routine A's draft would restore inside routine B.
    const layoutA = [{ id: "squat", sets: 5 }];
    const layoutB = [{ id: "deadlift", sets: 3 }];
    const idA = computeDraftIdentity(
      identityParts({
        scope: "routine:routine-A",
        epoch: 0,
        dayIndex: -1,
        dayName: "Legs A",
        layout: layoutA,
      })
    );
    const idB = computeDraftIdentity(
      identityParts({
        scope: "routine:routine-B",
        epoch: 0,
        dayIndex: -1,
        dayName: "Legs B",
        layout: layoutB,
      })
    );
    const routineA = renderHook(() => useWorkoutDraft("user-A", -1, idA));
    act(() =>
      routineA.result.current.save({ ...draftFor(-1), dayName: "Legs A" })
    );

    const routineB = renderHook(() => useWorkoutDraft("user-A", -1, idB));
    expect(routineB.result.current.load()).toBeNull();
    // Routine A still resumes its own draft.
    expect(routineA.result.current.load()).not.toBeNull();
  });

  it("keeps a mismatched identified draft in storage for its own surface", () => {
    // Opening a DIFFERENT session must not destroy a legitimate
    // in-flight draft — only fail to offer it here.
    const day0 = renderHook(() => useWorkoutDraft("user-A", 0, IDENTITY));
    act(() => day0.result.current.save(draftFor(0)));

    const otherIdentity = computeDraftIdentity(
      identityParts({ dayIndex: 3, dayName: "Pull" })
    );
    const day3 = renderHook(() => useWorkoutDraft("user-A", 3, otherIdentity));
    expect(day3.result.current.load()).toBeNull();
    // The day-0 draft survives untouched.
    expect(window.localStorage.getItem(scopedKey("user-A"))).not.toBeNull();
    expect(day0.result.current.load()).not.toBeNull();
  });

  it("drops a legacy identity-less scoped draft on read", () => {
    // Drafts written before LIFT-01 have no identity — their layout
    // provenance is unknown, so they are discarded, not resumed.
    window.localStorage.setItem(
      scopedKey("user-A"),
      JSON.stringify({ ...draftFor(0), savedAt: Date.now() })
    );
    const { result } = renderHook(() => useWorkoutDraft("user-A", 0, IDENTITY));
    expect(result.current.load()).toBeNull();
    expect(window.localStorage.getItem(scopedKey("user-A"))).toBeNull();
  });

  it("stamps the identity into the saved draft", () => {
    const { result } = renderHook(() => useWorkoutDraft("user-A", 0, IDENTITY));
    act(() => result.current.save(draftFor(0)));
    const stored = JSON.parse(
      window.localStorage.getItem(scopedKey("user-A"))!
    ) as WorkoutDraft;
    expect(stored.identity).toBe(IDENTITY);
  });
});

describe("computeDraftIdentity", () => {
  it("is deterministic for identical parts", () => {
    expect(computeDraftIdentity(identityParts())).toBe(
      computeDraftIdentity(identityParts())
    );
  });

  it("differs on scope, epoch, day, name, layout order and set count", () => {
    const base = computeDraftIdentity(identityParts());
    expect(
      computeDraftIdentity(identityParts({ scope: "routine:x" }))
    ).not.toBe(base);
    expect(computeDraftIdentity(identityParts({ epoch: 2 }))).not.toBe(base);
    expect(computeDraftIdentity(identityParts({ dayIndex: 1 }))).not.toBe(base);
    expect(computeDraftIdentity(identityParts({ dayName: "Pull" }))).not.toBe(
      base
    );
    expect(
      computeDraftIdentity(
        identityParts({
          layout: [
            { id: "overhead-press", sets: 3 },
            { id: "bench-press", sets: 3 },
          ],
        })
      )
    ).not.toBe(base);
    expect(
      computeDraftIdentity(
        identityParts({
          layout: [
            { id: "bench-press", sets: 4 },
            { id: "overhead-press", sets: 3 },
          ],
        })
      )
    ).not.toBe(base);
  });
});

describe("clearWorkoutDraft (non-hook, sign-out path)", () => {
  it("clears the given uid's scoped draft", () => {
    window.localStorage.setItem(
      scopedKey("user-A"),
      JSON.stringify({
        ...draftFor(0),
        savedAt: Date.now(),
        identity: IDENTITY,
      })
    );
    clearWorkoutDraft("user-A");
    expect(window.localStorage.getItem(scopedKey("user-A"))).toBeNull();
  });

  it("no-ops on a missing uid", () => {
    expect(() => clearWorkoutDraft("")).not.toThrow();
  });
});
