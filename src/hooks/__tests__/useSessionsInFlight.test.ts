/**
 * The sessions under way on this phone, as Home and Train read them for
 * the In progress strip. They live in local storage, outside React, so
 * the hook reads them when the screen opens, when the account changes,
 * when the app comes back, and on `refresh`. The routines a routine's
 * drafts were kept from are followed in Firestore (the one fake).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  flushSnapshots,
  readLog,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { useSessionsInFlight } from "../useSessionsInFlight";
import { useWorkoutDraft, computeDraftIdentity } from "../useWorkoutDraft";
import {
  writeStoredRun,
  clearStoredRun,
  RUN_RESUME_SCHEMA_VERSION,
} from "@/lib/runResumeStorage";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";
import {
  ROUTINE_DAY_INDEX,
  routineDraftIdentity,
  type RoutineLayout,
} from "@/features/program/routineSession";
import { deleteSavedRoutine } from "@/lib/savedRoutines";

const IDENTITY = computeDraftIdentity({
  scope: "programme",
  epoch: 1,
  dayIndex: 0,
  dayName: "Push",
  layout: [{ id: "bench-press", sets: 3 }],
});

function saveDraft(uid: string) {
  const { result } = renderHook(() => useWorkoutDraft(uid, 0, IDENTITY));
  act(() => {
    result.current.save({
      dayIndex: 0,
      dayName: "Push",
      setLogs: [[{ reps: 5, weight: 60, completed: true, type: "working" }]],
      exerciseNotes: {},
      elapsedSeconds: 300,
      currentExIndex: 0,
      completionId: "c1",
      completionCommandId: "c1",
    });
  });
}

function saveRun(uid: string) {
  writeStoredRun(uid, {
    v: RUN_RESUME_SCHEMA_VERSION,
    config: {
      activityType: "freerun",
      autoPause: true,
      audioCues: true,
      audioCueFrequency: "every_km",
      paceAlerts: false,
      voiceRate: 0.9,
      displayStats: ["pace", "distance", "time"],
      target: { type: "none" },
      planMetadata: freeformPlanMetadata("freeform"),
    },
    startedAt: Date.now() - 600_000,
    accumulatedSeconds: 540,
    isRunning: false,
    points: [],
    lastWriteAt: Date.now(),
    phase: "paused",
  });
}

const ARMS: RoutineLayout = {
  id: "r1",
  name: "Arms",
  exercises: [
    {
      name: "Barbell Curl",
      exerciseId: "barbell-curl",
      summary: "3×10",
      setCount: 3,
      targetReps: 10,
      targetWeightKg: 30,
    },
  ],
};
/** A routine's document, as `saveRoutine` writes it. */
function routineDoc({ name, exercises }: RoutineLayout) {
  return {
    name,
    exercises,
    sourceActivityId: "a1",
    sourceAuthorId: "user-A",
    sourceAuthorName: "Ann",
  };
}

function saveRoutineDraft(uid: string, routine: RoutineLayout) {
  const identity = routineDraftIdentity(routine);
  const { result } = renderHook(() =>
    useWorkoutDraft(uid, ROUTINE_DAY_INDEX, identity)
  );
  act(() => {
    result.current.save({
      dayIndex: ROUTINE_DAY_INDEX,
      dayName: routine.name,
      setLogs: [[{ reps: 10, weight: 30, completed: true, type: "working" }]],
      exerciseNotes: {},
      elapsedSeconds: 200,
      currentExIndex: 0,
      completionId: "c2",
      completionCommandId: "c2",
    });
  });
}

/** Every read of a routine. The fake logs a listener as its subscription
 *  and a read per delivery. */
const routineReads = () =>
  readLog().filter((read) => read.path.includes("/savedRoutines/"));
/** The routines followed: one subscription each. */
const routinesFollowed = () =>
  routineReads()
    .filter((read) => read.op === "onSnapshot")
    .map((read) => read.path);

beforeEach(() => {
  window.localStorage.clear();
  resetFirestore();
});

describe("useSessionsInFlight", () => {
  it("reads the account's workout drafts and its stored run", () => {
    saveDraft("user-A");
    saveRun("user-A");
    const { result } = renderHook(() => useSessionsInFlight("user-A"));
    expect(result.current.drafts.map((d) => d.identity)).toEqual([IDENTITY]);
    expect(result.current.run).toMatchObject({ accumulatedSeconds: 540 });
  });

  it("never shows one account another's session", () => {
    saveDraft("user-A");
    saveRun("user-A");
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string | null }) => useSessionsInFlight(uid),
      { initialProps: { uid: "user-A" as string | null } }
    );
    expect(result.current.drafts).toHaveLength(1);
    rerender({ uid: "user-B" });
    expect(result.current.drafts).toEqual([]);
    expect(result.current.run).toBeNull();
    rerender({ uid: null });
    expect(result.current.drafts).toEqual([]);
  });

  it("follows the routines its drafts were kept from, and reads no other", async () => {
    seedFirestore({
      "users/user-A/savedRoutines/r1": routineDoc(ARMS),
      "users/user-A/savedRoutines/r2": routineDoc({ ...ARMS, name: "Legs" }),
    });
    saveRoutineDraft("user-A", ARMS);
    const { result } = renderHook(() => useSessionsInFlight("user-A"));
    await flushSnapshots();
    expect([...result.current.routines.keys()]).toEqual(["r1"]);
    expect(result.current.routines.get("r1")).toMatchObject({
      id: "r1",
      name: "Arms",
      exercises: [expect.objectContaining({ setCount: 3 })],
    });
    expect(routinesFollowed()).toEqual(["users/user-A/savedRoutines/r1"]);
    expect(routineReads().filter((read) => !read.path.endsWith("/r1"))).toEqual(
      []
    );

    // Deleted, on this phone or another: no longer there to offer.
    await act(async () => {
      await deleteSavedRoutine("user-A", "r1");
    });
    await flushSnapshots();
    expect(result.current.routines.size).toBe(0);
  });

  it("reads no routine while no routine's workout is under way", async () => {
    seedFirestore({ "users/user-A/savedRoutines/r1": routineDoc(ARMS) });
    saveDraft("user-A");
    const { result } = renderHook(() => useSessionsInFlight("user-A"));
    await flushSnapshots();
    expect(result.current.drafts).toHaveLength(1);
    expect(result.current.routines.size).toBe(0);
    expect(routineReads()).toEqual([]);
  });

  it("never hands one account another's routines", async () => {
    seedFirestore({ "users/user-A/savedRoutines/r1": routineDoc(ARMS) });
    saveRoutineDraft("user-A", ARMS);
    // The same routine id under the other account, which has no such
    // routine: the routine named stays the same as the account changes.
    saveRoutineDraft("user-B", ARMS);
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string | null }) => useSessionsInFlight(uid),
      { initialProps: { uid: "user-A" as string | null } }
    );
    await flushSnapshots();
    expect(result.current.routines.has("r1")).toBe(true);
    rerender({ uid: "user-B" });
    expect(result.current.routines.size).toBe(0);
    await flushSnapshots();
    expect(result.current.routines.size).toBe(0);
  });

  it("reads again on refresh and when the app comes back", () => {
    const { result } = renderHook(() => useSessionsInFlight("user-A"));
    expect(result.current.run).toBeNull();
    saveRun("user-A");
    act(() => result.current.refresh());
    expect(result.current.run).not.toBeNull();
    clearStoredRun("user-A");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.run).toBeNull();
  });
});
