// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  flushSnapshots,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { writeFeel } from "@/lib/readinessFeel";
import {
  isScheduledHardRun,
  savedWorkoutLoadsLegs,
  useTodayReadiness,
} from "../useTodayReadiness";

vi.mock("firebase/firestore");
const owner = vi.hoisted(() => ({ currentUser: { uid: "athlete-1" } }));
vi.mock("@/lib/firebase", () => ({ db: {}, auth: owner }));
vi.mock("@/lib/auth", () => ({
  useUid: () => owner.currentUser.uid,
}));

const YESTERDAY = "2026-09-12";
const TODAY_NOON = new Date(2026, 8, 13, 12, 0, 0);

beforeEach(() => {
  localStorage.clear();
  resetFirestore();
  owner.currentUser = { uid: "athlete-1" };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TODAY_NOON);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("savedWorkoutLoadsLegs", () => {
  it("detects knee- and hip-dominant working sets", () => {
    expect(
      savedWorkoutLoadsLegs({
        exercises: [
          {
            exerciseId: "barbell-squat",
            exerciseName: "Barbell Back Squat",
            category: "Legs",
            caloriesBurned: 120,
            sets: [{ setNumber: 1, reps: 5, weightKg: 100, type: "working" }],
          },
        ],
      })
    ).toBe(true);
  });

  it("ignores upper-body-only workouts and warmup-only leg entries", () => {
    expect(
      savedWorkoutLoadsLegs({
        exercises: [
          {
            exerciseId: "bench-press",
            exerciseName: "Barbell Bench Press",
            category: "Chest",
            caloriesBurned: 90,
            sets: [{ setNumber: 1, reps: 8, weightKg: 80, type: "working" }],
          },
        ],
      })
    ).toBe(false);

    expect(
      savedWorkoutLoadsLegs({
        exercises: [
          {
            exerciseId: "barbell-squat",
            exerciseName: "Barbell Back Squat",
            category: "Legs",
            caloriesBurned: 10,
            sets: [{ setNumber: 1, reps: 5, weightKg: 40, type: "warmup" }],
          },
        ],
      })
    ).toBe(false);
  });
});

describe("isScheduledHardRun", () => {
  it("classifies tempo, intervals, long, and race as hard and easy as not hard", () => {
    expect(isScheduledHardRun({ type: "tempo" })).toBe(true);
    expect(isScheduledHardRun({ type: "intervals" })).toBe(true);
    expect(isScheduledHardRun({ type: "long" })).toBe(true);
    expect(isScheduledHardRun({ type: "race" })).toBe(true);
    expect(isScheduledHardRun({ type: "easy" })).toBe(false);
    expect(isScheduledHardRun(null)).toBe(false);
  });
});

describe("useTodayReadiness — bidirectional leg interference and feel sync", () => {
  it("flags leg day yesterday before today's hard run from caller-supplied workouts", () => {
    const { result } = renderHook(() =>
      useTodayReadiness(undefined, null, {
        todayHardRun: true,
        recentWorkouts: [
          {
            date: YESTERDAY,
            exercises: [
              {
                exerciseId: "romanian-deadlift",
                exerciseName: "Romanian Deadlift",
                category: "Legs",
                caloriesBurned: 100,
                sets: [
                  { setNumber: 1, reps: 8, weightKg: 90, type: "working" },
                ],
              },
            ],
          },
        ],
      })
    );

    expect(result.current.readiness.word).toBe("Steady");
    expect(result.current.readiness.line).toBe(
      "Leg day yesterday, before today’s hard run"
    );
    expect(result.current.readiness.offerEasier).toBe(true);
  });

  it("queries yesterday's workouts from Firestore when todayHardRun is true and recentWorkouts is omitted", async () => {
    seedFirestore({
      "users/athlete-1/workouts/w1": {
        date: YESTERDAY,
        createdAt: Timestamp.fromDate(new Date(2026, 8, 12, 18, 0, 0)),
        totalCalories: 250,
        durationMinutes: 50,
        notes: "Lower",
        exercises: [
          {
            exerciseId: "barbell-squat",
            exerciseName: "Barbell Back Squat",
            category: "Legs",
            caloriesBurned: 120,
            sets: [{ setNumber: 1, reps: 6, weightKg: 100, type: "working" }],
          },
        ],
      },
    });

    const { result } = renderHook(() =>
      useTodayReadiness(undefined, null, { todayHardRun: true })
    );
    await flushSnapshots();

    await waitFor(() => expect(result.current.readiness.word).toBe("Steady"));
    expect(result.current.readiness.line).toBe(
      "Leg day yesterday, before today’s hard run"
    );

    // Combining leg day yesterday with a tired morning answer elevates to Go easy.
    act(() => {
      writeFeel("athlete-1", "2026-09-13", "tired");
    });
    expect(result.current.readiness.word).toBe("Go easy");
    expect(result.current.readiness.reasons.map((r) => r.kind)).toEqual([
      "feel",
      "leg_day_yesterday",
    ]);
  });

  it("stays quiet when yesterday was a leg day but today is an easy run", () => {
    const { result } = renderHook(() =>
      useTodayReadiness(undefined, null, {
        todayHardRun: false,
        recentWorkouts: [
          {
            date: YESTERDAY,
            exercises: [
              {
                exerciseId: "barbell-squat",
                exerciseName: "Barbell Back Squat",
                category: "Legs",
                caloriesBurned: 120,
                sets: [
                  { setNumber: 1, reps: 6, weightKg: 100, type: "working" },
                ],
              },
            ],
          },
        ],
      })
    );

    expect(result.current.readiness.word).toBeNull();
    expect(result.current.readiness.offerEasier).toBe(false);
  });
});
