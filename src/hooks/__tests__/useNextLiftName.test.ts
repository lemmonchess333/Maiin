/**
 * The next workout's name the training-day reminder says (Mob1 call 3),
 * read from the programme document and following it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockUid: string | null = "u1";
vi.mock("@/lib/auth", () => ({
  useUid: () => mockUid,
}));

import { doc, setDoc } from "firebase/firestore";
import { useNextLiftName } from "../useNextLiftName";
import {
  seedFirestore,
  resetFirestore,
  flushSnapshots,
} from "@/test/firestoreHarness";

const workouts = (doneFirst: boolean) => [
  { dayName: "Upper — Chest & Back", exercises: [], completed: doneFirst },
  { dayName: "Lower — Squat Focus", exercises: [], completed: false },
  { dayName: "Upper — Shoulders & Arms", exercises: [], completed: false },
  { dayName: "Lower — Deadlift Focus", exercises: [], completed: false },
];

beforeEach(() => {
  resetFirestore();
  mockUid = "u1";
});

describe("useNextLiftName", () => {
  it("names the programme's next workout, and the one after once it is done", async () => {
    seedFirestore({
      "users/u1/programState/current": { workouts: workouts(false) },
    });
    const { result } = renderHook(() => useNextLiftName());
    await waitFor(() => expect(result.current).toBe("Upper A"));

    await act(async () => {
      await setDoc(doc({} as never, "users", "u1", "programState", "current"), {
        workouts: workouts(true),
      });
    });
    await waitFor(() => expect(result.current).toBe("Lower A"));
  });

  it("is null for an account with no programme, never the last account's name", async () => {
    seedFirestore({
      "users/u1/programState/current": { workouts: workouts(false) },
      "users/u2": { displayName: "B" },
    });
    const { result, rerender } = renderHook(() => useNextLiftName());
    // Anchored on the first account's name, so the switch is what is read.
    await waitFor(() => expect(result.current).toBe("Upper A"));
    mockUid = "u2";
    rerender();
    expect(result.current).toBeNull();
    await act(async () => {
      await flushSnapshots();
    });
    expect(result.current).toBeNull();
  });

  it("is null signed out", () => {
    mockUid = null;
    const { result } = renderHook(() => useNextLiftName());
    expect(result.current).toBeNull();
  });
});
