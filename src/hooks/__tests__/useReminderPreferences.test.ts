import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));
vi.mock("@/lib/errorReporting", () => ({ captureError: vi.fn() }));

import { useReminderPreferences } from "../useReminderPreferences";
import {
  deferWrites,
  failNextFirestore,
  pendingWrites,
  readDoc,
  releaseAllWrites,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import {
  isReminderLocallyOff,
  setReminderLocallyOff,
} from "@/lib/localReminderChoice";

const DEFAULTS = { enabled: false, time: "07:00" };
const PATH = "users/u1/settings/workoutReminders";

beforeEach(() => {
  localStorage.clear();
  resetFirestore();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("useReminderPreferences", () => {
  it("loads defaults when the settings document is absent", async () => {
    const { result } = renderHook(() =>
      useReminderPreferences("u1", "workout", DEFAULTS)
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.reminders).toEqual(DEFAULTS);
    expect(result.current.failed).toBe(false);
  });

  it("merges stored settings with defaults and saves only the changed fields", async () => {
    seedFirestore({ [PATH]: { enabled: true } });
    const { result } = renderHook(() =>
      useReminderPreferences("u1", "workout", DEFAULTS)
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.reminders).toEqual({ enabled: true, time: "07:00" });
    await act(async () => {
      await result.current.updateReminders({ time: "09:30" });
    });
    expect(result.current.reminders).toEqual({ enabled: true, time: "09:30" });
    expect(readDoc(PATH)).toEqual({ enabled: true, time: "09:30" });
    expect(result.current.saving).toBe(false);
  });

  it("exposes a failed read and retries the same account's settings", async () => {
    seedFirestore({ [PATH]: { enabled: true, time: "08:15" } });
    failNextFirestore("getDoc", { path: PATH, code: "unavailable" });
    const { result } = renderHook(() =>
      useReminderPreferences("u1", "workout", DEFAULTS)
    );
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.loading).toBe(false);
    await expect(
      result.current.updateReminders({ enabled: true })
    ).rejects.toThrow("Reminder settings aren’t ready");
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.reminders.time).toBe("08:15"));
    expect(result.current.failed).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("preserves local Off after a rejected save and a fresh mount", async () => {
    seedFirestore({ [PATH]: { enabled: true, time: "08:15" } });
    const first = renderHook(() =>
      useReminderPreferences("u1", "workout", DEFAULTS)
    );
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    failNextFirestore("setDoc", { path: PATH, code: "unavailable" });
    await act(async () => {
      await expect(
        first.result.current.updateReminders({ enabled: false })
      ).rejects.toThrow("saved on this phone");
    });
    expect(first.result.current.reminders.enabled).toBe(false);
    expect(first.result.current.saving).toBe(false);
    expect(isReminderLocallyOff("u1", "workout")).toBe(true);
    expect(readDoc(PATH)?.enabled).toBe(true);
    first.unmount();
    const next = renderHook(() =>
      useReminderPreferences("u1", "workout", DEFAULTS)
    );
    await waitFor(() => expect(next.result.current.loading).toBe(false));
    expect(next.result.current.reminders).toEqual({
      enabled: false,
      time: "08:15",
    });
  });

  it("does not apply an old account's late save to the new account", async () => {
    seedFirestore({
      [PATH]: DEFAULTS,
      "users/u2/settings/workoutReminders": { enabled: false, time: "11:00" },
    });
    const { result, rerender } = renderHook(
      ({ uid }) => useReminderPreferences(uid, "workout", DEFAULTS),
      { initialProps: { uid: "u1" } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    deferWrites();
    let save!: Promise<void>;
    act(() => {
      save = result.current.updateReminders({ enabled: true, time: "09:30" });
    });
    await waitFor(() => expect(pendingWrites()).toEqual([PATH]));
    rerender({ uid: "u2" });
    await waitFor(() => expect(result.current.reminders.time).toBe("11:00"));
    expect(setReminderLocallyOff("u1", "workout", true)).toBe(true);
    await act(async () => {
      releaseAllWrites();
      await save;
    });
    expect(readDoc(PATH)).toEqual({ enabled: true, time: "09:30" });
    expect(result.current.reminders).toEqual({ enabled: false, time: "11:00" });
    expect(result.current.saving).toBe(false);
    expect(isReminderLocallyOff("u1", "workout")).toBe(true);
  });

  it("keeps meal and workout settings and local choices independent", async () => {
    const mealDefaults = {
      enabled: false,
      breakfast: { enabled: true, time: "08:00" },
    };
    seedFirestore({
      [PATH]: { enabled: true, time: "09:00" },
      "users/u1/settings/mealReminders": {
        enabled: true,
        breakfast: { enabled: true, time: "08:30" },
      },
    });
    expect(setReminderLocallyOff("u1", "workout", true)).toBe(true);
    const { result } = renderHook(() => ({
      workout: useReminderPreferences("u1", "workout", DEFAULTS),
      meal: useReminderPreferences("u1", "meal", mealDefaults),
    }));
    await waitFor(() => expect(result.current.meal.loading).toBe(false));
    await waitFor(() => expect(result.current.workout.loading).toBe(false));
    expect(result.current.workout.reminders.enabled).toBe(false);
    expect(result.current.meal.reminders.enabled).toBe(true);
    await act(async () => {
      await result.current.meal.updateReminders({
        breakfast: { enabled: true, time: "10:00" },
      });
    });
    expect(readDoc("users/u1/settings/mealReminders")?.breakfast).toEqual({
      enabled: true,
      time: "10:00",
    });
    expect(readDoc(PATH)).toEqual({ enabled: true, time: "09:00" });
  });
});
