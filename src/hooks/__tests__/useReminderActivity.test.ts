import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { savedRunDoc } from "@/test/sessionFixtures";
import { useReminderActivity } from "../useReminderActivity";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
let uid: string | null = "u1";
vi.mock("@/lib/auth", () => ({ useUid: () => uid }));

beforeEach(() => {
  resetFirestore();
  // The offline queue lives in localStorage, which outlives a test.
  localStorage.clear();
  uid = "u1";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 6, 12));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("reminder activity source boundaries", () => {
  it("counts only today's active meals and valid completed sessions", async () => {
    seedFirestore({
      "users/u1/meals/a": { date: "2026-09-06", meal: "lunch" },
      "users/u1/meals/b": {
        date: "2026-09-06",
        meal: "breakfast",
        deletedAt: 1,
      },
      "users/u1/meals/c": { date: "2026-09-05", meal: "dinner" },
      "users/u1/runs/a": savedRunDoc(
        "2026-09-06",
        { distance: 5000 },
        new Date(2026, 8, 6, 10)
      ),
      "users/u1/settings/push": { enabled: true, streak: true },
    });
    const { result } = renderHook(() => useReminderActivity());
    await waitFor(() => expect(result.current.activity.ready).toBe(true));
    expect(result.current.activity.meals).toEqual(["lunch"]);
    expect(result.current.activity.workout).toBe(true);
    expect(result.current.pushOwns).toBe(true);
  });
  it("clears the previous account's completion and consent before another account loads", async () => {
    seedFirestore({
      "users/u1/meals/a": { date: "2026-09-06", meal: "lunch" },
      "users/u1/settings/push": { enabled: true, streak: true },
      "users/u2/settings/push": { enabled: false },
    });
    const { result, rerender } = renderHook(() => useReminderActivity());
    await waitFor(() => expect(result.current.activity.ready).toBe(true));
    uid = "u2";
    rerender();
    await waitFor(() => expect(result.current.activity.ready).toBe(true));
    expect(result.current.activity.meals).toEqual([]);
    expect(result.current.pushOwns).toBe(false);
  });
  it("does not treat an invalid or zero-distance run as today's session", async () => {
    seedFirestore({
      "users/u1/runs/a": savedRunDoc(
        "2026-09-06",
        { distance: 5000, isInvalid: true },
        new Date(2026, 8, 6, 10)
      ),
      "users/u1/runs/b": savedRunDoc(
        "2026-09-06",
        { distance: 0 },
        new Date(2026, 8, 6, 11)
      ),
    });
    const { result } = renderHook(() => useReminderActivity());
    await waitFor(() => expect(result.current.activity.ready).toBe(true));
    expect(result.current.activity.workout).toBe(false);
  });
  it("counts a run on the day it started, as the streak does (Lift3)", async () => {
    // Begun at 23:40 last night, saved at 00:15: last night's run. The
    // streak counts it for yesterday, so today still needs a session and
    // the reminder must still come.
    seedFirestore({
      "users/u1/runs/late": savedRunDoc(
        "2026-09-05",
        { distance: 5000 },
        new Date(2026, 8, 6, 0, 15)
      ),
    });
    const { result } = renderHook(() => useReminderActivity());
    await waitFor(() => expect(result.current.activity.ready).toBe(true));
    expect(result.current.activity.workout).toBe(false);
  });
  it("counts a run saved on this phone before it syncs", async () => {
    const { queueDurableWrite } = await import("@/lib/offlineQueue");
    const { result } = renderHook(() => useReminderActivity());
    await waitFor(() => expect(result.current.activity.ready).toBe(true));
    expect(result.current.activity.workout).toBe(false);
    act(() =>
      queueDurableWrite(
        "u1",
        "users/u1/runs",
        "offline",
        savedRunDoc("2026-09-06", { distance: 5000 }, new Date(2026, 8, 6, 11))
      )
    );
    expect(result.current.activity.workout).toBe(true);
  });
});
