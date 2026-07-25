/**
 * useWeekPulse — the mid-week counterpart of the weekly review, shown on
 * the two completion screens.
 *
 * Its contract is unusually specific about what it must NOT say:
 *
 *   - Returning `null` means "the card doesn't render". That is the failure
 *     mode too — a completion screen must never jank, so a read error leaves
 *     the pulse null rather than surfacing anything.
 *   - Planned comparisons appear ONLY when a plan exists. Run9a locked
 *     freeform running to done-only framing, so a freeform user must see
 *     "3 runs", never "3 of 5" against a target they never set.
 *
 * "Shows nothing" and "shows the wrong thing" are both invisible in a stub
 * that hands back a fixed array; both are observable against a seeded store.
 *
 * The clock is fixed because week bounds drive every query.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockProfile: Record<string, unknown> | null = {};
let mockUser: { uid: string } | null = { uid: "u1" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile }),
}));

let mockStreak = 0;
vi.mock("@/features/streaks/useStreaks", () => ({
  useStreaks: () => ({ currentStreak: mockStreak }),
}));

import { useWeekPulse } from "../useWeekPulse";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
} from "@/test/firestoreHarness";

/** Wed 15 Jul 2026 → current week is Sun 12th … Sat 18th. */
const NOW = new Date(2026, 6, 15, 9, 0, 0);
const IN_WEEK = "2026-07-14";
const LAST_WEEK = "2026-07-08";

const LIFT_SCHEDULE = [
  { type: "lift" },
  { type: "run" },
  { type: "lift" },
  { type: "rest" },
  { type: "lift" },
  { type: "run" },
  { type: "rest" },
];

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  // Date only — faking setTimeout would freeze the clock waitFor polls on.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockUser = { uid: "u1" };
  mockProfile = { weekSchedule: LIFT_SCHEDULE };
  mockStreak = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useWeekPulse", () => {
  it("counts THIS week's sessions and ignores last week's", async () => {
    seedFirestore({
      "users/u1/workouts/in": { date: IN_WEEK, exercises: [] },
      "users/u1/workouts/old": { date: LAST_WEEK, exercises: [] },
      "users/u1/runs/in": { date: IN_WEEK, distance: 5000, duration: 1500 },
      "users/u1/runs/old": { date: LAST_WEEK, distance: 9000, duration: 2700 },
    });
    const { result } = renderHook(() => useWeekPulse());
    await waitFor(() => expect(result.current).not.toBeNull());

    expect(result.current?.lifts).toMatchObject({ done: 1, planned: 3 });
    expect(result.current?.runs).toMatchObject({ count: 1, km: 5 });
  });

  it("excludes ineligible runs from the distance", async () => {
    seedFirestore({
      "users/u1/runs/good": { date: IN_WEEK, distance: 5000, duration: 1500 },
      "users/u1/runs/bogus": {
        date: IN_WEEK,
        distance: 40000,
        duration: 8,
        isInvalid: true,
      },
    });
    const { result } = renderHook(() => useWeekPulse());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.runs?.km).toBe(5);
  });

  it("shows NO planned-run target for a freeform runner (Run9a)", async () => {
    // Done-only framing. "3 of 5" against a target the user never set is
    // the thing the lock forbids.
    seedFirestore({
      "users/u1/runs/r1": { date: IN_WEEK, distance: 5000, duration: 1500 },
    });
    const { result } = renderHook(() => useWeekPulse());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.runs?.planned).toBeNull();
  });

  it("shows a planned-run target once a race plan exists", async () => {
    mockProfile = {
      weekSchedule: LIFT_SCHEDULE,
      runMode: "race_prep",
      raceGoal: { distance: "10k", targetDate: "2026-09-05" },
    };
    seedFirestore({
      "users/u1/runs/r1": { date: IN_WEEK, distance: 5000, duration: 1500 },
      "users/u1/programState/current": {
        runPlan: {
          raceGoal: { distance: "10k", targetDate: "2026-09-05" },
          runDays: [
            { date: "2026-07-13" },
            { date: "2026-07-15" },
            { date: IN_WEEK },
            { date: LAST_WEEK }, // outside the week — must not count
          ],
        },
      },
    });
    const { result } = renderHook(() => useWeekPulse());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.runs?.planned).toBe(3);
  });

  it("carries the streak through", async () => {
    mockStreak = 12;
    seedFirestore({
      "users/u1/workouts/w1": { date: IN_WEEK, exercises: [] },
    });
    const { result } = renderHook(() => useWeekPulse());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.streak).toBe(12);
  });

  it("stays NULL when the read fails — the card just doesn't render", async () => {
    // A completion screen must never jank. Failure is silence, not an
    // error state.
    seedFirestore({
      "users/u1/workouts/w1": { date: IN_WEEK, exercises: [] },
    });
    failNextFirestore("getDocs", { path: "users/u1/workouts" });

    const { result } = renderHook(() => useWeekPulse());
    // Give the effect a chance to resolve before asserting absence.
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBeNull();
  });

  it("stays null when signed out", async () => {
    mockUser = null;
    const { result } = renderHook(() => useWeekPulse());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBeNull();
  });
});
