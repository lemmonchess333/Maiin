import { beforeEach, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import { useTrainingFuelData } from "../useTrainingFuelData";
import {
  flushSnapshots,
  readLog,
  resetFirestore,
  seedFirestore,
  writeLog,
} from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
beforeEach(resetFirestore);

const TODAY = "2026-09-15";
const WORKOUT = "users/u1/workouts/lift";
const PROGRAM = "users/u1/programState/current";
const subscriptions = () =>
  readLog().filter((read) => read.op === "onSnapshot");

it("shares three subscriptions and live corrections until the last consumer leaves", async () => {
  seedFirestore({
    [WORKOUT]: { date: TODAY, totalCalories: 250 },
    [PROGRAM]: { weekNumber: 2 },
  });
  const first = renderHook(() => useTrainingFuelData("u1", TODAY));
  const second = renderHook(() => useTrainingFuelData("u1", TODAY));
  await flushSnapshots();
  expect(subscriptions().map((read) => read.path)).toEqual([
    PROGRAM,
    "users/u1/workouts",
    "users/u1/runs",
  ]);
  expect(first.result.current).toBe(second.result.current);
  expect(first.result.current.workouts[0].totalCalories).toBe(250);
  expect(first.result.current.program?.weekNumber).toBe(2);
  expect(first.result.current.workoutsLoaded).toBe(true);
  expect(first.result.current.runsLoaded).toBe(true);

  first.unmount();
  await act(async () => {
    seedFirestore({
      [WORKOUT]: { date: TODAY, totalCalories: 300 },
      [PROGRAM]: { weekNumber: 3 },
    });
  });
  await flushSnapshots();
  expect(second.result.current.workouts[0].totalCalories).toBe(300);
  expect(second.result.current.program?.weekNumber).toBe(3);
  expect(subscriptions()).toHaveLength(3);
  second.unmount();

  seedFirestore({ [WORKOUT]: { date: TODAY, totalCalories: 175 } });
  const reopened = renderHook(() => useTrainingFuelData("u1", TODAY));
  await flushSnapshots();
  expect(subscriptions()).toHaveLength(6);
  expect(reopened.result.current.workouts[0].totalCalories).toBe(175);
  expect(writeLog()).toEqual([]);
});

it("clears account data on sign-out and refreshes the rolling window on a new day", async () => {
  seedFirestore({
    [WORKOUT]: { date: TODAY, totalCalories: 250 },
    "users/u1/workouts/boundary": { date: "2026-08-16", totalCalories: 100 },
    [PROGRAM]: { weekNumber: 2 },
    "users/u2/workouts/other": { date: TODAY, totalCalories: 50 },
  });
  const view = renderHook(({ uid, today }) => useTrainingFuelData(uid, today), {
    initialProps: { uid: "u1" as string | null, today: TODAY },
  });
  await flushSnapshots();
  expect(view.result.current.workouts).toHaveLength(2);
  view.rerender({ uid: null, today: TODAY });
  expect(view.result.current.workouts).toEqual([]);
  expect(view.result.current.program).toBeNull();
  expect(view.result.current.workoutsLoaded).toBe(false);
  expect(subscriptions()).toHaveLength(3);

  view.rerender({ uid: "u2", today: TODAY });
  await flushSnapshots();
  expect(view.result.current.workouts).toEqual([
    { date: TODAY, totalCalories: 50 },
  ]);
  expect(view.result.current.program).toBeNull();

  view.rerender({ uid: "u1", today: "2026-09-16" });
  await flushSnapshots();
  expect(view.result.current.workouts).toEqual([
    { date: TODAY, totalCalories: 250 },
  ]);
  expect(subscriptions()).toHaveLength(9);
});

it("keeps the bounded history and excludes invalid runs from the shared burn data", async () => {
  const completedAt = Timestamp.fromDate(new Date("2026-09-15T12:00:00"));
  seedFirestore({
    ...Object.fromEntries(
      Array.from({ length: 65 }, (_, i) => [
        `users/u1/workouts/lift-${i}`,
        { date: TODAY, totalCalories: 50 },
      ])
    ),
    "users/u1/runs/valid": {
      completedAt,
      calories: 100,
      distance: 5000,
      duration: 1800,
    },
    "users/u1/runs/invalid": { completedAt, calories: 9999, isInvalid: true },
    "users/u1/runs/old": {
      completedAt: Timestamp.fromDate(new Date("2026-08-01T12:00:00")),
      calories: 200,
    },
  });
  const { result } = renderHook(() => useTrainingFuelData("u1", TODAY));
  await flushSnapshots();
  expect(result.current.workouts).toHaveLength(60);
  expect(result.current.runs).toEqual([{ completedAt, calories: 100 }]);
});
