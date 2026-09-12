// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Timestamp, type Firestore } from "firebase/firestore";
import {
  queueDurableWrite,
  pendingDocumentWrites,
  flushQueue,
  getFailedRunSaveCount,
} from "../offlineQueue";
import { deleteLoggedSession } from "../sessionDelete";
import { useRunningStats } from "@/hooks/useRunningStats";
import { useSessionDoc } from "@/hooks/useSessionDoc";
import {
  resetFirestore,
  seedFirestore,
  readDoc,
  failNextFirestore,
  allPaths,
  deferReads,
  pendingReads,
  releaseAllReads,
} from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
const { auth, db } = vi.hoisted(() => ({
  auth: { currentUser: { uid: "run-a" } as { uid: string } | null },
  db: {} as Firestore,
}));
vi.mock("@/lib/firebase", () => ({ auth, db }));
vi.mock("@/lib/auth", () => ({ useUid: () => auth.currentUser?.uid ?? null }));
vi.mock("@/lib/errorReporting", () => ({ captureError: vi.fn() }));
const path = "users/run-a/runs";
const data = () => ({
  distance: 5000,
  duration: 1500,
  avgPace: 300,
  completedAt: Timestamp.fromDate(new Date()),
  startedAt: Timestamp.fromDate(new Date(Date.now() - 1500000)),
  date: "2026-09-12",
  notes: "Original run",
  activityType: "freerun",
  points: [{ lat: 51.5, lon: -0.1, timestamp: Date.now() }],
});
function online(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}
beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  online(false);
  auth.currentUser = { uid: "run-a" };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("run save recovery", () => {
  it("retains a rejected run and replays its original identity, timestamps and data", async () => {
    const original = data();
    queueDurableWrite("run-a", path, "one-run", original);
    online(true);
    failNextFirestore("commit", { code: "permission-denied" });
    expect(await flushQueue(db, "run-a")).toBe(0);
    expect(getFailedRunSaveCount("run-a")).toBe(1);
    const recovered = pendingDocumentWrites("run-a", path)[0];
    expect(recovered.id).toBe("one-run");
    expect(recovered.data.completedAt).toEqual(original.completedAt);
    expect(recovered.data.points).toEqual(original.points);
    expect(await flushQueue(db, "run-a")).toBe(1);
    expect(await flushQueue(db, "run-a")).toBe(0);
    expect(readDoc(`${path}/one-run`)?.notes).toBe("Original run");
    expect(allPaths().filter((key) => key.startsWith(path))).toHaveLength(1);
    expect(pendingDocumentWrites("run-a", path)).toEqual([]);
  });

  it("shows a queued run in history and detail after reopening without exposing it to another account", async () => {
    queueDurableWrite("run-a", path, "one-run", data());
    const view = renderHook(() => ({
      history: useRunningStats(),
      detail: useSessionDoc<{ id: string; notes: string }>(
        auth.currentUser?.uid,
        "runs",
        "one-run"
      ),
    }));
    expect(view.result.current.history.runs.map((run) => run.id)).toEqual([
      "one-run",
    ]);
    expect(view.result.current.detail.status).toBe("ready");
    expect(view.result.current.detail.data?.notes).toBe("Original run");
    await waitFor(() =>
      expect(view.result.current.history.loading).toBe(false)
    );
    auth.currentUser = { uid: "run-b" };
    view.rerender();
    expect(view.result.current.history.runs).toEqual([]);
    expect(view.result.current.detail.data).toBeNull();
  });

  it("keeps a run visible once sync acknowledges it without double counting", async () => {
    queueDurableWrite("run-a", path, "one-run", data());
    const view = renderHook(() => useRunningStats());
    online(true);
    await act(async () => {
      await flushQueue(db, "run-a");
    });
    await waitFor(() => expect(view.result.current.runs).toHaveLength(1));
    expect(view.result.current.weeklyData[0].runCount).toBe(1);
    expect(view.result.current.weeklyData[0].totalDistance).toBe(5);
  });

  it("preserves later notes and an already-synced run during an ambiguous retry", async () => {
    queueDurableWrite("run-a", path, "one-run", data());
    seedFirestore({
      [`${path}/one-run`]: { ...data(), notes: "Edited elsewhere" },
    });
    online(true);
    await flushQueue(db, "run-a");
    expect(readDoc(`${path}/one-run`)?.notes).toBe("Edited elsewhere");
    queueDurableWrite("run-a", path, "two", data());
    queueDurableWrite(
      "run-a",
      path,
      "two",
      { notes: "Corrected after saving" },
      true
    );
    await flushQueue(db, "run-a");
    expect(readDoc(`${path}/two`)?.notes).toBe("Corrected after saving");
  });

  it("stops when accounts switch during acknowledgement and retains the originating run", async () => {
    queueDurableWrite("run-a", path, "one-run", data());
    online(true);
    deferReads();
    const flushing = flushQueue(db, "run-a");
    await vi.waitFor(() => expect(pendingReads()).toHaveLength(1));
    auth.currentUser = { uid: "run-b" };
    releaseAllReads();
    expect(await flushing).toBe(0);
    expect(await flushQueue(db, "run-b")).toBe(0);
    expect(pendingDocumentWrites("run-a", path)).toHaveLength(1);
    expect(allPaths()).toEqual([]);
  });

  it("keeps a saved route preview while an effort edit is waiting to sync", async () => {
    seedFirestore({
      [`${path}/one-run`]: {
        ...data(),
        points: [
          { lat: 51.5, lon: -0.1 },
          { lat: 51.51, lon: -0.09 },
        ],
      },
    });
    const view = renderHook(() => useRunningStats());
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    const preview = view.result.current.runs[0].routePreview;
    act(() =>
      queueDurableWrite(
        "run-a",
        path,
        "one-run",
        { relativeEffort: "harder" },
        true
      )
    );
    expect(view.result.current.runs[0].routePreview).toEqual(preview);
    expect(view.result.current.runs[0].relativeEffort).toBe("harder");
  });

  it("refuses local acceptance when storage is full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    expect(() => queueDurableWrite("run-a", path, "one-run", data())).toThrow(
      "Couldn't save on this phone"
    );
    expect(pendingDocumentWrites("run-a", path)).toEqual([]);
  });

  it("never resurrects a queued run after deletion", async () => {
    queueDurableWrite("run-a", path, "one-run", data());
    await expect(
      deleteLoggedSession({ uid: "run-a", kind: "run", id: "one-run" })
    ).rejects.toThrow("Connect");
    expect(pendingDocumentWrites("run-a", path)).toHaveLength(1);
    online(true);
    await deleteLoggedSession({ uid: "run-a", kind: "run", id: "one-run" });
    await flushQueue(db, "run-a");
    expect(readDoc(`${path}/one-run`)).toBeUndefined();
    expect(pendingDocumentWrites("run-a", path)).toEqual([]);
  });
});
