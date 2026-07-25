/**
 * useWorkouts — exemplar of the ADR-0009 Firestore seam covering the LIVE
 * half: an `onSnapshot` subscription with two coverage modes, and writes
 * that go through `safeMerge` (the offline-queue wrapper) rather than the
 * SDK directly.
 *
 * This suite REPLACES the previous `useWorkouts.test.tsx`, which stubbed
 * the SDK inline and additionally mocked away `offlineQueue`, `workoutBurn`
 * and `dateHelpers`. Having mocked the collaborators, all it could assert
 * was the shape of the constraint objects handed to its own stub — that a
 * `limit(50)` was constructed, not that fifty workouts came back. Its three
 * real contracts (recent is bounded, complete is not, an account switch
 * can't leak) are carried over below and now assert on observed data.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/activationTracker", () => ({ noteActivitySnapshot: vi.fn() }));

let mockProfile: Record<string, unknown> | null = { weightKg: 80 };
let mockUser: { uid: string } | null = { uid: "u1" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile }),
}));

import { useWorkouts, workoutTonnageKg } from "../useWorkouts";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  allPaths,
  flushSnapshots,
  failNextFirestore,
} from "@/test/firestoreHarness";

function session(date: string, weightKg = 100, reps = 5) {
  return {
    date,
    exercises: [
      {
        exerciseId: "bench",
        exerciseName: "Bench Press",
        category: "chest",
        caloriesBurned: 0,
        sets: [{ setNumber: 1, reps, weightKg }],
      },
    ],
    totalCalories: 0,
    durationMinutes: 45,
    notes: "",
  };
}

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  mockProfile = { weightKg: 80 };
  mockUser = { uid: "u1" };
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

/** N sessions on consecutive days, newest last. */
function seedDays(uid: string, count: number) {
  const seed: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < count; i++) {
    const d = new Date(2026, 5, 2 + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    seed[`users/${uid}/workouts/w${String(i).padStart(3, "0")}`] = session(key);
  }
  seedFirestore(seed);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workoutTonnageKg", () => {
  it("sums weight × reps across every set", () => {
    expect(
      workoutTonnageKg({
        exercises: [
          {
            exerciseId: "a",
            exerciseName: "A",
            category: "c",
            caloriesBurned: 0,
            sets: [
              { setNumber: 1, reps: 5, weightKg: 100 },
              { setNumber: 2, reps: 3, weightKg: 110 },
            ],
          },
        ],
      })
    ).toBe(830);
  });
});

describe("subscription", () => {
  it("loads workouts newest-first", async () => {
    seedFirestore({
      "users/u1/workouts/a": session("2026-07-01"),
      "users/u1/workouts/b": session("2026-07-10"),
      "users/u1/workouts/c": session("2026-07-05"),
    });

    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workouts.map((w) => w.id)).toEqual(["b", "c", "a"]);
  });

  it("drops malformed documents rather than rendering them", async () => {
    seedFirestore({
      "users/u1/workouts/ok": session("2026-07-01"),
      "users/u1/workouts/bad": { notes: "no date, no exercises" },
    });

    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workouts.map((w) => w.id)).toEqual(["ok"]);
  });

  it("re-renders when a workout is written elsewhere — it is a LIVE listener", async () => {
    seedFirestore({ "users/u1/workouts/a": session("2026-07-01") });
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.workouts).toHaveLength(1));

    seedFirestore({ "users/u1/workouts/b": session("2026-07-09") });
    await flushSnapshots();

    expect(result.current.workouts.map((w) => w.id)).toEqual(["b", "a"]);
  });

  it("exits the skeleton when the subscription errors", async () => {
    // A transient rules/network error must not strand the view on a spinner.
    failNextFirestore("onSnapshot", { times: 10 });
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workouts).toEqual([]);
  });
});

describe("coverage", () => {
  it("'recent' returns the newest 50 and drops the rest", async () => {
    seedDays("u1", 60);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.workouts).toHaveLength(50);
    // Newest-first, so the ten OLDEST are the ones missing.
    expect(result.current.workouts[0].id).toBe("w059");
    expect(result.current.workouts.at(-1)?.id).toBe("w010");
  });

  it("'complete' returns every workout — the lifetime surfaces depend on it", async () => {
    // The regression this guards: History silently omitted a user's oldest
    // sessions once they passed 50 logged workouts.
    seedDays("u1", 60);
    const { result } = renderHook(() => useWorkouts({ coverage: "complete" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.workouts).toHaveLength(60);
    expect(result.current.workouts.at(-1)?.id).toBe("w000");
  });

  it("only 'recent' feeds the activation funnel", async () => {
    // A 'complete' listener mounting after a 'recent' one would otherwise
    // report every pre-existing workout as newly-created activity.
    const { noteActivitySnapshot } = await import("@/lib/activationTracker");
    seedDays("u1", 3);

    const { result } = renderHook(() => useWorkouts({ coverage: "complete" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(noteActivitySnapshot).not.toHaveBeenCalled();

    const recent = renderHook(() => useWorkouts());
    await waitFor(() => expect(recent.result.current.loading).toBe(false));
    expect(noteActivitySnapshot).toHaveBeenCalledWith(
      "workout",
      "u1",
      expect.arrayContaining(["w000"])
    );
  });
});

describe("account switching", () => {
  it("never shows account A's history to account B", async () => {
    seedFirestore({
      "users/A/workouts/a1": session("2026-07-01"),
      "users/B/workouts/b1": session("2026-07-02"),
    });
    mockUser = { uid: "A" };
    const { result, rerender } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.workouts).toHaveLength(1));
    expect(result.current.workouts[0].id).toBe("a1");

    mockUser = { uid: "B" };
    rerender();

    // B must never transiently see a1 — the effect clears before resubscribing.
    await waitFor(() => expect(result.current.workouts).toHaveLength(1));
    expect(result.current.workouts[0].id).toBe("b1");
  });

  it("clears on sign-out", async () => {
    seedFirestore({ "users/u1/workouts/a": session("2026-07-01") });
    const { result, rerender } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.workouts).toHaveLength(1));

    mockUser = null;
    rerender();

    expect(result.current.workouts).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

describe("saveWorkout", () => {
  it("writes under a date-derived id and recomputes totalCalories", async () => {
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let id: string | undefined;
    await act(async () => {
      // Caller-supplied totalCalories is deliberately ignored.
      id = await result.current.saveWorkout({
        ...session("2026-07-14"),
        totalCalories: 9999,
      });
    });

    expect(id).toMatch(/^2026-07-14-\d+$/);
    const saved = readDoc(`users/u1/workouts/${id}`) as Record<string, unknown>;
    expect(saved.date).toBe("2026-07-14");
    expect(saved.totalCalories).toBeGreaterThan(0);
    expect(saved.totalCalories).not.toBe(9999);
  });

  it("normalises a UTC ISO timestamp to a LOCAL date key", async () => {
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let id: string | undefined;
    await act(async () => {
      id = await result.current.saveWorkout({
        ...session("2026-07-14"),
        date: "2026-07-14T22:30:00.000Z",
      });
    });

    // Whatever the zone, the stored key must be a bare local yyyy-MM-dd —
    // a stored UTC string breaks every local-day read downstream.
    const saved = readDoc(`users/u1/workouts/${id}`) as Record<string, unknown>;
    expect(saved.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(String(id).startsWith(String(saved.date))).toBe(true);
  });

  it("still saves (calories 0) when bodyweight is unknown", async () => {
    // Onboarding gap: no weightKg yet. The session must not be lost.
    mockProfile = {};
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let id: string | undefined;
    await act(async () => {
      id = await result.current.saveWorkout(session("2026-07-14"));
    });

    const saved = readDoc(`users/u1/workouts/${id}`) as Record<string, unknown>;
    expect(saved).toBeDefined();
    expect(saved.totalCalories).toBe(0);
  });

  it("queues offline instead of writing", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveWorkout(session("2026-07-14"));
    });

    expect(allPaths()).toEqual([]); // nothing hit Firestore
    expect(localStorage.getItem("tropos_offline_queue")).toContain(
      "users/u1/workouts"
    );
  });
});

describe("deleteWorkout", () => {
  it("removes the document and the row disappears from the live list", async () => {
    seedFirestore({
      "users/u1/workouts/a": session("2026-07-01"),
      "users/u1/workouts/b": session("2026-07-02"),
    });
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.workouts).toHaveLength(2));

    await act(async () => {
      await result.current.deleteWorkout("a");
    });
    await flushSnapshots();

    expect(result.current.workouts.map((w) => w.id)).toEqual(["b"]);
  });
});

describe("getWorkoutsForDate", () => {
  it("returns every session logged on that local day", async () => {
    seedFirestore({
      "users/u1/workouts/a": session("2026-07-01"),
      "users/u1/workouts/b": session("2026-07-01"),
      "users/u1/workouts/c": session("2026-07-02"),
    });
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.workouts).toHaveLength(3));

    expect(result.current.getWorkoutsForDate("2026-07-01")).toHaveLength(2);
    expect(result.current.getWorkoutsForDate("2026-07-03")).toEqual([]);
  });
});
