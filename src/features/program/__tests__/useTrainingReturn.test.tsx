// @vitest-environment jsdom
/**
 * The one return check's read (App1 Q35): what Home asks for, and when it
 * may answer.
 *
 * The rules are `runReturn.test.ts`'s, `liftLayoff.test.ts`'s and
 * `trainingReturn.test.ts`'s. What this pins is the read around them,
 * against the one Firestore fake (ADR-0009):
 *   - a lift-only plan reads no runs at all;
 *   - a runner's last run is read through the saved-run reader, the same
 *     window the race plan's re-entry reads;
 *   - nothing is offered from a cached answer, which can be missing the run
 *     someone logged on another phone.
 *
 * Every run is dated from the clock, so the suite holds on any day CI runs
 * it, the +90-day run included.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import {
  flushSnapshots,
  readLog,
  resetFirestore,
  seedFirestore,
  setSnapshotMetadata,
} from "@/test/firestoreHarness";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";
import type { UserProfile } from "@/lib/auth";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "u1" }));

import { useTrainingReturn } from "../useTrainingReturn";
import type { DatedWorkout } from "../liftLayoff";

const RUNS = "users/u1/runs";

/** A day n days before today, and a saved run on it as RunSummary writes
 *  one: dated, completed, and past the distance and duration floors. */
function dayBefore(n: number): string {
  return localDateString(addLocalDays(new Date(), -n));
}
function seedRunDaysAgo(id: string, n: number) {
  const day = addLocalDays(new Date(), -n);
  day.setHours(8, 0, 0, 0);
  seedFirestore({
    [`${RUNS}/${id}`]: {
      completedAt: Timestamp.fromDate(day),
      date: localDateString(day),
      distance: 5000,
      duration: 1800,
      activityType: "easy",
    },
  });
}

/** Runs only: no lift days on the plan. */
const runner = {
  runMode: "freeform",
  weeklyWorkoutsTarget: 0,
} as UserProfile;
const lifter = {
  runFrequency: "none",
  runMode: "freeform",
  weekSchedule: [{ day: 1, type: "lift" }],
} as UserProfile;

const NO_LIFTS: DatedWorkout[] = [];

/** The run side of the check, as Home reads it. */
function render(profile: UserProfile, programLoading = false) {
  return renderHook(
    () =>
      useTrainingReturn({
        profile,
        programState: null,
        programLoading,
        todayKey: localDateString(new Date()),
        workouts: NO_LIFTS,
      }).run
  );
}

const runReads = () =>
  readLog().filter((r) => r.op === "onSnapshot" && r.path === RUNS).length;

describe("useTrainingReturn — the run side", () => {
  beforeEach(() => resetFirestore());

  it("offers a free runner the easy run, keyed on their last run", async () => {
    seedRunDaysAgo("old", 40);
    seedRunDaysAgo("last", 16);
    const { result } = render(runner);
    await waitFor(() => expect(result.current.offer).toBe("easy-run"));
    expect(result.current.daysAway).toBe(16);
    expect(result.current.dismissKey).toBe(dayBefore(16));
  });

  it("offers nothing to someone who ran this week", async () => {
    seedRunDaysAgo("last", 3);
    const { result } = render(runner);
    // Anchored on the read landing: the days away are known before the
    // absence of an offer means anything.
    await waitFor(() => expect(result.current.daysAway).toBe(3));
    expect(result.current.offer).toBeNull();
  });

  it("reads no runs for a lift-only plan", async () => {
    seedRunDaysAgo("last", 40);
    const { result, rerender } = render(lifter);
    rerender();
    expect(runReads()).toBe(0);
    expect(result.current.offer).toBeNull();

    // The positive control: the same store, read for a runner, is read.
    render(runner);
    await waitFor(() => expect(runReads()).toBe(1));
  });

  it("waits for the server before greeting anyone", async () => {
    seedRunDaysAgo("last", 30);
    setSnapshotMetadata(RUNS, { fromCache: true });
    const { result } = render(runner);
    await waitFor(() => expect(runReads()).toBe(1));
    await flushSnapshots();
    expect(result.current.offer).toBeNull();
    expect(result.current.daysAway).toBeNull();

    // The server's answer, the same runs confirmed: now it greets. Without
    // this the silence above would also pass for a read that never landed.
    setSnapshotMetadata(RUNS, { fromCache: false });
    seedRunDaysAgo("older", 45);
    await waitFor(() => expect(result.current.offer).toBe("easy-run"));
  });

  it("waits for the programme, which can say the race is over", async () => {
    seedRunDaysAgo("last", 30);
    const { result, rerender } = renderHook(
      ({ loading }) =>
        useTrainingReturn({
          profile: runner,
          programState: null,
          programLoading: loading,
          todayKey: localDateString(new Date()),
          workouts: NO_LIFTS,
        }).run,
      { initialProps: { loading: true } }
    );
    await waitFor(() => expect(runReads()).toBe(1));
    expect(result.current.offer).toBeNull();
    rerender({ loading: false });
    await waitFor(() => expect(result.current.offer).toBe("easy-run"));
  });
});

describe("useTrainingReturn — both sports from one read", () => {
  beforeEach(() => resetFirestore());

  const liftedDaysAgo = (n: number): DatedWorkout => ({
    date: dayBefore(n),
    exercises: [{ sets: [{}, {}, {}] }],
  });
  /** A seven-day week with these days, the rest rest. */
  const week = (days: Record<number, "lift" | "run">) =>
    Array.from({ length: 7 }, (_, day) => ({
      day,
      type: days[day] ?? "rest",
    })) as UserProfile["weekSchedule"];
  const hybrid = {
    athleteType: "Hybrid",
    runMode: "freeform",
    weekSchedule: week({ 1: "lift", 3: "run" }),
  } as UserProfile;

  it("a hybrid who stopped lifting but kept running: the weights, not the running", async () => {
    seedRunDaysAgo("last", 2);
    const lifts = [liftedDaysAgo(20)];
    const { result } = renderHook(() =>
      useTrainingReturn({
        profile: hybrid,
        programState: null,
        programLoading: false,
        todayKey: localDateString(new Date()),
        workouts: lifts,
      })
    );
    await waitFor(() => expect(result.current.run.daysAway).toBe(2));
    expect(result.current.run.offer).toBeNull();
    expect(result.current.lift.welcomeBack).toBe(true);
    expect(result.current.lift.daysAway).toBe(20);
  });

  it("a plan with no lifting is never offered the weights, however old the last lift", async () => {
    seedRunDaysAgo("last", 2);
    const lifts = [liftedDaysAgo(60)];
    const { result } = renderHook(() =>
      useTrainingReturn({
        profile: { ...runner, weekSchedule: week({ 3: "run" }) },
        programState: null,
        programLoading: false,
        todayKey: localDateString(new Date()),
        workouts: lifts,
      })
    );
    await waitFor(() => expect(result.current.run.daysAway).toBe(2));
    expect(result.current.lift.welcomeBack).toBe(false);
    expect(result.current.lift.daysAway).toBeNull();
  });
});
