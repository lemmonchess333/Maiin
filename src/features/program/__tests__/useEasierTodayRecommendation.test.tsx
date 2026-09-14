// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  flushSnapshots,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { queueDurableWrite, flushQueue } from "@/lib/offlineQueue";
import { useEasierTodayRecommendation } from "../useEasierTodayRecommendation";
import type { WorkoutDay } from "../programTypes";

vi.mock("firebase/firestore");
const owner = vi.hoisted(() => ({ currentUser: { uid: "runner" } }));
vi.mock("@/lib/firebase", () => ({ db: {}, auth: owner }));
vi.mock("@/lib/auth", () => ({ useUid: () => owner.currentUser.uid }));

const lower = {
  dayName: "Lower",
  dayType: "lower",
  completed: false,
  exercises: [{ exerciseId: "squat", movementCategory: "knee_dominant" }],
} as WorkoutDay;
const upper = {
  ...lower,
  dayName: "Upper",
  exercises: [
    { exerciseId: "bench-press", movementCategory: "horizontal_push" },
  ],
} as WorkoutDay;
const path = "users/runner/runs/a";
function run(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-09-12",
    completedAt: Timestamp.fromDate(new Date(2026, 8, 12, 12)),
    distance: 5000,
    duration: 1800,
    activityType: "tempo",
    ...overrides,
  };
}
beforeEach(() => {
  resetFirestore();
  owner.currentUser = { uid: "runner" };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 13, 12));
});
afterEach(() => vi.useRealTimers());

describe("the next lifting session uses performed run evidence", () => {
  it("uses the saved start day when a demanding run finishes after midnight", async () => {
    seedFirestore({
      [path]: run({
        completedAt: Timestamp.fromDate(new Date(2026, 8, 13, 0, 10)),
      }),
    });
    const { result } = renderHook(() =>
      useEasierTodayRecommendation(lower, [], false)
    );
    await flushSnapshots();
    expect(result.current?.reason).toContain("hard run yesterday");
  });
  it("does not relabel a two-day-old run as yesterday after a late finish", async () => {
    seedFirestore({ [path]: run({ date: "2026-09-11" }) });
    const { result } = renderHook(() =>
      useEasierTodayRecommendation(lower, [], false)
    );
    await flushSnapshots();
    expect(result.current?.recommended).toBe(false);
  });
  it("falls back to the completion day for legacy runs and respects the actual lift day", async () => {
    const legacy: Record<string, unknown> = run();
    delete legacy.date;
    seedFirestore({ [path]: legacy });
    const { result, rerender } = renderHook(
      ({ day }) => useEasierTodayRecommendation(day, [], false),
      { initialProps: { day: lower } }
    );
    await waitFor(() => expect(result.current?.recommended).toBe(true));
    rerender({ day: upper });
    expect(result.current?.recommended).toBe(false);
  });
  it.each([
    { distance: 0 },
    { duration: 0 },
    { isInvalid: true },
    { savedAnyway: true },
  ])(
    "does not infer a demanding run from ineligible work %j",
    async (overrides) => {
      seedFirestore({ [path]: run(overrides) });
      const { result } = renderHook(() =>
        useEasierTodayRecommendation(lower, [], false)
      );
      await flushSnapshots();
      expect(result.current?.recommended).toBe(false);
    }
  );
  it("withdraws advice during pending corrections and re-evaluates after sync and deletion", async () => {
    seedFirestore({ [path]: run() });
    const { result } = renderHook(() =>
      useEasierTodayRecommendation(lower, [], false)
    );
    await waitFor(() => expect(result.current?.recommended).toBe(true));
    act(() =>
      queueDurableWrite(
        "runner",
        "users/runner/runs",
        "a",
        { duration: 1700 },
        true
      )
    );
    const whilePending = result.current?.recommended;
    await act(async () => {
      await flushQueue(db, "runner");
    });
    expect(whilePending).toBe(false);
    await waitFor(() => expect(result.current?.recommended).toBe(true));
    await act(async () => {
      await updateDoc(doc(db, path), { activityType: "easy" });
    });
    expect(result.current?.recommended).toBe(false);
    await act(async () => {
      await updateDoc(doc(db, path), { activityType: "tempo" });
    });
    expect(result.current?.recommended).toBe(true);
    await act(async () => {
      await deleteDoc(doc(db, path));
    });
    expect(result.current?.recommended).toBe(false);
  });
  it("expires yesterday's advice on app resume and clears it on account changes", async () => {
    seedFirestore({ [path]: run() });
    const { result, rerender } = renderHook(() =>
      useEasierTodayRecommendation(lower, [], false)
    );
    await waitFor(() => expect(result.current?.recommended).toBe(true));
    act(() => {
      vi.setSystemTime(new Date(2026, 8, 14, 12));
      window.dispatchEvent(new Event("focus"));
    });
    await flushSnapshots();
    expect(result.current?.recommended).toBe(false);
    act(() => {
      vi.setSystemTime(new Date(2026, 8, 13, 12));
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(result.current?.recommended).toBe(true));
    owner.currentUser = { uid: "other" };
    rerender();
    expect(result.current?.recommended).toBe(false);
  });
  it.each([
    { label: "no sets", sets: [] },
    {
      label: "warm-ups only",
      sets: [{ type: "warmup", reps: 8, weightKg: 20 }],
    },
  ])("does not treat $label as muscle training", async ({ sets }) => {
    const workouts = [
      { date: "2026-09-12", exercises: [{ exerciseId: "squat", sets }] },
    ];
    const { result } = renderHook(() =>
      useEasierTodayRecommendation(lower, workouts, false)
    );
    await flushSnapshots();
    expect(result.current?.recommended).toBe(false);
  });
  it("keeps genuine completed bodyweight work and an independent deload recommendation", async () => {
    const workouts = [
      {
        date: "2026-09-12",
        exercises: [
          {
            exerciseId: "squat",
            sets: [{ type: "working", reps: 8, weightKg: 0 }],
          },
        ],
      },
    ];
    const { result, rerender } = renderHook(
      ({ history, deload }) =>
        useEasierTodayRecommendation(lower, history, deload),
      { initialProps: { history: workouts, deload: false } }
    );
    await flushSnapshots();
    expect(result.current?.reason).toContain("Quads");
    rerender({ history: [], deload: true });
    expect(result.current?.reason).toContain("deload");
  });
});
