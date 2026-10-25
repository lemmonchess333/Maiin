/**
 * The sessions under way on this phone, as Home and Train read them for
 * the In progress strip. They live in local storage, outside React, so
 * the hook reads them when the screen opens, when the account changes,
 * when the app comes back, and on `refresh`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionsInFlight } from "../useSessionsInFlight";
import { useWorkoutDraft, computeDraftIdentity } from "../useWorkoutDraft";
import {
  writeStoredRun,
  clearStoredRun,
  RUN_RESUME_SCHEMA_VERSION,
} from "@/lib/runResumeStorage";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";

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

beforeEach(() => {
  window.localStorage.clear();
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
