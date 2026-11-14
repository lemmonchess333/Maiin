/**
 * `useStepActivityOffer` — the activity level offer's reads and its save
 * (whole-app grill Q31). The rules are `stepActivity.ts`'s and tested
 * there; this pins what the hook reads before it speaks, that it reads
 * nothing until Health is connected, and what "Use", "Keep" and Undo
 * write.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { DailyValue } from "@/lib/bodySignals";

const h = vi.hoisted(() => ({
  steps: { status: "connected" as string },
  days: [] as unknown[],
  workouts: [] as { date: string; totalCalories: number }[],
  profile: null as Record<string, unknown> | null,
  updateProfile: vi.fn(),
}));

const readDailyStepTotals = vi.fn();
vi.mock("@/lib/healthKit", () => ({
  readDailyStepTotals: (...args: unknown[]) => readDailyStepTotals(...args),
}));
vi.mock("@/hooks/useSteps", () => ({ useSteps: () => h.steps }));
vi.mock("@/hooks/useLocalDateKey", () => ({
  // Wednesday: the last full week is 2 to 8 November.
  useLocalDateKey: () => "2026-11-11",
}));
vi.mock("@/hooks/useTrainingFuelData", () => ({
  useTrainingFuelData: (uid: string | null) => ({
    program: null,
    workouts: uid ? h.workouts : [],
    runs: [],
    workoutsLoaded: !!uid,
    runsLoaded: !!uid,
  }),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1" },
    profile: h.profile,
    updateProfile: h.updateProfile,
  }),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));

// ADR-0009: the one shared Firestore fake — bare mock + seedFirestore.
vi.mock("firebase/firestore");

const setDocGuarded = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: (...args: unknown[]) => setDocGuarded(...args),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import { useStepActivityOffer } from "../useStepActivityOffer";
import { buildActivityLevelPersistPayload } from "@/lib/goalWeightPlan";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";

const DAY_MS = 86_400_000;
const SETTINGS_DOC = "users/u1/settings/stepActivityOffer";
const LAST_WEEK = ["02", "03", "04", "05", "06", "07", "08"].map(
  (d) => `2026-11-${d}`
);

function walked(steps: number): DailyValue[] {
  return LAST_WEEK.map((dateKey) => ({ dateKey, value: steps }));
}

const LIGHT_CUTTER = {
  uid: "u1",
  weightKg: 90,
  heightCm: 180,
  age: 30,
  sex: "male",
  activityLevel: "light",
  goalWeightKg: 82,
  weeklyRateKg: -0.5,
  program: { goal: "cut", startWeight: 92, currentPhase: "build" },
  tdeeBase: 2210,
  targetCalories: 2210,
  targetProtein: 180,
  targetCarbs: 200,
  targetFat: 60,
};

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  h.steps = { status: "connected" };
  h.days = walked(11000);
  h.workouts = [];
  h.profile = { ...LIGHT_CUTTER };
  h.updateProfile.mockResolvedValue({ ok: true });
  readDailyStepTotals.mockImplementation(() => Promise.resolve(h.days));
});

describe("useStepActivityOffer reads", () => {
  it("nothing until Health is connected, then last full week's steps", async () => {
    h.steps = { status: "unavailable" };
    const { result, rerender } = renderHook(() => useStepActivityOffer());
    expect(result.current.offer).toBeNull();

    h.steps = { status: "connected" };
    rerender();
    await waitFor(() => expect(result.current.offer).not.toBeNull());
    // The web, and a phone not connected, read nothing at all.
    expect(readDailyStepTotals).toHaveBeenCalledTimes(1);
    const [start, end] = readDailyStepTotals.mock.calls[0] as [Date, Date];
    expect([start.getDate(), end.getDate()]).toEqual([2, 9]);
    expect([start.getHours(), end.getHours()]).toEqual([0, 0]);
  });

  it("offers the level the steps fall in, with the target the save sets", async () => {
    const { result } = renderHook(() => useStepActivityOffer());
    await waitFor(() => expect(result.current.offer).not.toBeNull());
    expect(result.current.offer).toMatchObject({
      from: "light",
      to: "active",
      averageSteps: 11000,
      direction: "up",
    });
    expect(result.current.nextTarget).toBe(
      buildActivityLevelPersistPayload(LIGHT_CUTTER as never, "active")
        .targetCalories
    );
  });

  it("stays quiet within 30 days of a Keep, and asks again after", async () => {
    seedFirestore({
      [SETTINGS_DOC]: { dismissedAt: Date.now() - 31 * DAY_MS },
    });
    const old = renderHook(() => useStepActivityOffer());
    await waitFor(() => expect(old.result.current.offer).not.toBeNull());
    old.unmount();

    seedFirestore({
      [SETTINGS_DOC]: { dismissedAt: Date.now() - 10 * DAY_MS },
    });
    readDailyStepTotals.mockClear();
    const recent = renderHook(() => useStepActivityOffer());
    // Anchored: the steps were read, and still no offer.
    await waitFor(() => expect(readDailyStepTotals).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(recent.result.current.offer).toBeNull();
  });

  it("holds a move down for a week with a lift logged in it", async () => {
    h.profile = { ...LIGHT_CUTTER, activityLevel: "active" };
    h.days = walked(4000);
    const free = renderHook(() => useStepActivityOffer());
    await waitFor(() =>
      expect(free.result.current.offer?.direction).toBe("down")
    );
    free.unmount();

    h.workouts = [{ date: "2026-11-05", totalCalories: 300 }];
    readDailyStepTotals.mockClear();
    const lifted = renderHook(() => useStepActivityOffer());
    await waitFor(() => expect(readDailyStepTotals).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(lifted.result.current.offer).toBeNull();
  });

  it("offers nothing when the save would also move the goal phase", async () => {
    // Weight has reached the goal since the last save: re-deriving would
    // switch the cutter to maintenance, the goal-reached prompt's call.
    h.profile = { ...LIGHT_CUTTER, weightKg: 82.3 };
    const { result } = renderHook(() => useStepActivityOffer());
    await waitFor(() => expect(readDailyStepTotals).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.offer).toBeNull();
  });
});

describe("useStepActivityOffer saves", () => {
  it("Use: the level and Settings' payload in one patch, with an Undo", async () => {
    const { result } = renderHook(() => useStepActivityOffer());
    await waitFor(() => expect(result.current.offer).not.toBeNull());

    await act(async () => {
      await result.current.accept();
    });
    const expected = buildActivityLevelPersistPayload(
      LIGHT_CUTTER as never,
      "active"
    ).payload;
    expect(h.updateProfile).toHaveBeenCalledTimes(1);
    expect(h.updateProfile).toHaveBeenCalledWith(expected);
    expect(result.current.offer).toBeNull();
    expect(toastSuccess).toHaveBeenCalledWith(
      "Activity level set to Active",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      })
    );

    // Undo puts back the stored fields exactly, and counts as a Keep.
    const undo = (
      toastSuccess.mock.calls[0][1] as { action: { onClick: () => void } }
    ).action.onClick;
    await act(async () => {
      undo();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(h.updateProfile).toHaveBeenLastCalledWith({
      activityLevel: "light",
      goalWeightKg: 82,
      weeklyRateKg: -0.5,
      program: LIGHT_CUTTER.program,
      targetCalories: 2210,
      targetProtein: 180,
      targetCarbs: 200,
      targetFat: 60,
    });
    await waitFor(() => expect(setDocGuarded).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenLastCalledWith(
      "Activity level back to Light"
    );
  });

  it("Use that fails to save brings the offer back", async () => {
    h.updateProfile.mockResolvedValue({ ok: false, error: new Error("x") });
    const { result } = renderHook(() => useStepActivityOffer());
    await waitFor(() => expect(result.current.offer).not.toBeNull());
    await act(async () => {
      await result.current.accept();
    });
    expect(h.updateProfile).toHaveBeenCalledTimes(1);
    expect(result.current.offer).not.toBeNull();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("Keep: saves when, never a step count, and the offer goes", async () => {
    const { result } = renderHook(() => useStepActivityOffer());
    await waitFor(() => expect(result.current.offer).not.toBeNull());
    const before = Date.now();
    await act(async () => {
      await result.current.keep();
    });
    expect(result.current.offer).toBeNull();
    expect(setDocGuarded).toHaveBeenCalledTimes(1);
    const [ref, data, options] = setDocGuarded.mock.calls[0] as [
      { path: string },
      { dismissedAt: number },
      unknown,
    ];
    expect(ref.path).toBe(SETTINGS_DOC);
    expect(Object.keys(data)).toEqual(["dismissedAt"]);
    expect(data.dismissedAt).toBeGreaterThanOrEqual(before);
    expect(options).toEqual({ merge: true });
    expect(h.updateProfile).not.toHaveBeenCalled();
  });

  it("Keep that fails to save says so and brings the offer back", async () => {
    setDocGuarded.mockRejectedValueOnce(new Error("offline refusal"));
    const { result } = renderHook(() => useStepActivityOffer());
    await waitFor(() => expect(result.current.offer).not.toBeNull());
    await act(async () => {
      await result.current.keep();
    });
    expect(toastError).toHaveBeenCalledWith(
      "Couldn’t save your choice. Try again."
    );
    expect(result.current.offer).not.toBeNull();
  });
});
