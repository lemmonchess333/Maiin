import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Timestamp, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { useRunningStats } from "../useRunningStats";
import { db } from "@/lib/firebase";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "runner" } },
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "runner" }));

beforeEach(() => {
  resetFirestore();
  vi.useFakeTimers({ toFake: ["Date"] });
  /* LOCAL components, not `Z`. The window this suite exercises is a
     local one, so "today" has to be a local day: at Pacific/Kiritimati
     (UTC+14) noon on the 13th UTC is already the 14th locally, which
     shifted the window a day and pushed the boundary run below out of
     it before the test began. */
  vi.setSystemTime(new Date(2026, 8, 13, 12));
  seedFirestore({
    "users/runner/runs/a": {
      completedAt: Timestamp.fromDate(new Date(2026, 8, 12, 12)),
      date: "2026-09-12",
      distance: 5000,
      duration: 1800,
      activityType: "easy",
      relativeEffort: "harder",
    },
  });
});
afterEach(() => vi.useRealTimers());

describe("running evidence stays current", () => {
  it("updates an already mounted consumer after a correction and deletion", async () => {
    const { result } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(result.current.runs).toHaveLength(1));
    await act(async () => {
      await updateDoc(doc(db, "users/runner/runs/a"), {
        relativeEffort: "matched",
        distance: 4000,
      });
    });
    await waitFor(() =>
      expect(result.current.runs[0].relativeEffort).toBe("matched")
    );
    expect(result.current.weeklyData[0].totalDistance).toBe(4);
    await act(async () => {
      await deleteDoc(doc(db, "users/runner/runs/a"));
    });
    await waitFor(() => expect(result.current.runs).toEqual([]));
    expect(result.current.weeklyData).toEqual([]);
  });
});

it("requeries on local day rollover without remounting", async () => {
  seedFirestore({
    /* Deliberately the LAST date inside the window, so the rollover has
       something to push out. With the clock at 13 September and a 30-day
       window ending today, that window opens on 15 August — one more day
       and this run is outside it before the test even starts.

       It read 14 August while `useRunningStats(30)` covered 31 dates. The
       run is still the boundary case it was written to be; the boundary
       moved when `days` started meaning `days`. Its size is pinned
       independently by `analyticsWindowAgreement.test.ts`, so this stays
       a literal rather than being computed from the code under test. */
    "users/runner/runs/edge": {
      completedAt: Timestamp.fromDate(new Date(2026, 7, 15, 12)),
      distance: 5000,
      duration: 1800,
    },
  });
  const { result } = renderHook(() => useRunningStats(30));
  await waitFor(() => expect(result.current.runs).toHaveLength(2));
  act(() => {
    vi.setSystemTime(new Date(2026, 8, 14, 12));
    window.dispatchEvent(new Event("focus"));
  });
  await waitFor(() =>
    expect(result.current.runs.map((r) => r.id)).toEqual(["a"])
  );
});

it("keeps queued corrections visible without deriving advice from partial sync", async () => {
  const { queueDurableWrite, flushQueue } = await import("@/lib/offlineQueue");
  const { result } = renderHook(() => useRunningStats(30));
  await waitFor(() => expect(result.current.evidenceReady).toBe(true));
  act(() =>
    queueDurableWrite(
      "runner",
      "users/runner/runs",
      "a",
      { relativeEffort: "matched" },
      true
    )
  );
  expect(result.current.runs[0].relativeEffort).toBe("matched");
  expect(result.current.evidenceReady).toBe(false);
  await act(async () => {
    await flushQueue(db, "runner");
  });
  await waitFor(() => expect(result.current.evidenceReady).toBe(true));
  expect(result.current.runs).toHaveLength(1);
  expect(result.current.runs[0].relativeEffort).toBe("matched");
});
