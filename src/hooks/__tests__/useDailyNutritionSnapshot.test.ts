/**
 * useDailyNutritionSnapshot — the single session-wide writer that records
 * today's macro target so the nutrition badges can ask what the target WAS
 * on each past day.
 *
 * It writes nothing visible, so every one of its rules fails silently:
 *
 *   - Deduped by signature. It re-snapshots when the target genuinely moves
 *     (logging a workout flips the day-type and shifts the carb/fat split),
 *     but an unchanged re-render must be a no-op — this is mounted for the
 *     whole session, so a missing guard is a write per render.
 *   - No usable target → NO write. A profile mid-setup has nothing honest to
 *     snapshot, and writing zeroes would tell the badges the user's target
 *     that day was zero, which every day trivially "hits".
 *   - A failed write RESETS the dedup ref, so the retry isn't suppressed by
 *     the guard that exists to prevent duplicates. Getting this backwards
 *     means one transient failure loses the day permanently.
 *
 * All three are questions about what reached the store, which is what the
 * write log answers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockUser: { uid: string } | null = { uid: "u1" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, profile: {} }),
  useUid: () => ({ user: mockUser, profile: {} }).user?.uid ?? null,
}));

let mockTargets: Record<string, number> = {
  finalTarget: 2400,
  protein: 160,
  carbs: 250,
  fat: 70,
};
vi.mock("@/hooks/useEffectiveTargets", () => ({
  useEffectiveTargets: () => mockTargets,
}));

import { useDailyNutritionSnapshot } from "../useDailyNutritionSnapshot";
import {
  resetFirestore,
  readDoc,
  writeLog,
  failNextFirestore,
} from "@/test/firestoreHarness";
import { localDateString } from "@/lib/dateHelpers";

const NOW = new Date(2026, 6, 15, 9, 0, 0);
let PATH = "";

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  PATH = `users/u1/dailyNutrition/${localDateString()}`;
  mockUser = { uid: "u1" };
  mockTargets = { finalTarget: 2400, protein: 160, carbs: 250, fat: 70 };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDailyNutritionSnapshot", () => {
  it("writes today's target under a date-keyed document", async () => {
    renderHook(() => useDailyNutritionSnapshot());
    await Promise.resolve();

    expect(readDoc(PATH)).toMatchObject({
      targetCalories: 2400,
      targetProtein: 160,
    });
  });

  it("is a NO-OP on re-render when the target hasn't moved", async () => {
    // Mounted session-wide, so a missing dedup guard is a write per render.
    const { rerender } = renderHook(() => useDailyNutritionSnapshot());
    await Promise.resolve();
    const after = writeLog().length;

    rerender();
    rerender();
    await Promise.resolve();

    expect(writeLog().length).toBe(after);
  });

  it("re-snapshots when the target genuinely moves", async () => {
    // Logging a workout flips the day-type and shifts the carb/fat split;
    // the badges need the value as it stood.
    const { rerender } = renderHook(() => useDailyNutritionSnapshot());
    await Promise.resolve();
    const before = writeLog().length;

    mockTargets = { ...mockTargets, carbs: 300, fat: 55 };
    rerender();
    await Promise.resolve();

    expect(writeLog().length).toBeGreaterThan(before);
    expect(readDoc(PATH)).toMatchObject({ targetCarbs: 300 });
  });

  it("writes NOTHING when there is no usable target", async () => {
    // A profile mid-setup has nothing honest to snapshot. Writing zeroes
    // would tell the badges the target was 0 — which every day "hits".
    mockTargets = { finalTarget: 0, protein: 0, carbs: 0, fat: 0 };
    renderHook(() => useDailyNutritionSnapshot());
    await Promise.resolve();

    expect(writeLog()).toEqual([]);
  });

  it("writes nothing when signed out", async () => {
    mockUser = null;
    renderHook(() => useDailyNutritionSnapshot());
    await Promise.resolve();

    expect(writeLog()).toEqual([]);
  });

  it("lets a retry through after a failed write, at the SAME target", async () => {
    // The dedup guard prevents duplicate writes; if a failure left the
    // signature recorded, one transient error would lose the day
    // permanently. The catch resets the ref so the retry isn't suppressed.
    //
    // The effect re-runs here because `user` is a dep by identity and
    // `onAuthStateChanged` fires several times per sign-in (CLAUDE.md), so
    // a fresh object with the same uid is a real occurrence — and the
    // target signature is unchanged, which is exactly the case the reset
    // exists for.
    failNextFirestore("setDoc", { path: PATH });
    const { rerender } = renderHook(() => useDailyNutritionSnapshot());
    await Promise.resolve();
    await Promise.resolve();
    expect(readDoc(PATH)).toBeUndefined(); // the write failed

    mockUser = { uid: "u1" }; // same user, new object → effect re-runs
    rerender();
    await Promise.resolve();

    expect(readDoc(PATH)).toMatchObject({ targetCalories: 2400 });
  });
});
