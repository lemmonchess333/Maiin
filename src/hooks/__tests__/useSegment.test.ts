/**
 * useSegment and useSegmentBoard (Run26 call 3): a segment's page reads the
 * segment, the signed-in person's own efforts on it (live, fastest first)
 * and whether they made it; the board comes from the getSegmentBoard
 * callable, never from Firestore.
 *
 * Firestore runs on the one fake (ADR-0009); the callable is stubbed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: (_f: unknown, name: string) => (data: unknown) =>
    H.call(name, data),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import { useSegment, useSegmentBoard } from "../useSegment";
import {
  failNextFirestore,
  flushSnapshots,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

const ME = "me";
const line = [
  { lat: 51.4433, lon: -0.1517 },
  { lat: 51.4433, lon: -0.1373 },
];
const effort = (runId: string, elapsedSeconds: number) => ({
  uid: ME,
  segmentId: "hill",
  runId,
  lap: 1,
  elapsedSeconds,
  startedAtMs: 1,
  day: "2026-11-10",
});

beforeEach(() => {
  resetFirestore();
  H.call.mockReset();
  seedFirestore({
    "segments/hill": {
      name: "Hill",
      lengthMeters: 800,
      points: line,
      startCell: "gcpuc",
    },
    [`users/${ME}/segmentEfforts/r1_hill_1`]: effort("r1", 260),
    [`users/${ME}/segmentEfforts/r2_hill_1`]: effort("r2", 245),
    // Someone else's effort, which the page never reads.
    "users/other/segmentEfforts/o1_hill_1": {
      ...effort("o1", 200),
      uid: "other",
    },
  });
});

describe("useSegment", () => {
  it("reads the segment and the person's own efforts, fastest first", async () => {
    const { result } = renderHook(() => useSegment(ME, "hill"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() => expect(result.current.efforts).toHaveLength(2));
    expect(result.current.segment).toMatchObject({
      name: "Hill",
      lengthMeters: 800,
    });
    expect(result.current.efforts.map((e) => e.elapsedSeconds)).toEqual([
      245, 260,
    ]);
    expect(result.current.mine).toBe(false);
  });

  it("knows its maker", async () => {
    seedFirestore({ "segmentOwners/hill": { uid: ME, sourceRunId: "r1" } });
    const { result } = renderHook(() => useSegment(ME, "hill"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.mine).toBe(true);
  });

  it("adds a run timed while the page is open", async () => {
    const { result } = renderHook(() => useSegment(ME, "hill"));
    await waitFor(() => expect(result.current.efforts).toHaveLength(2));
    seedFirestore({
      [`users/${ME}/segmentEfforts/r3_hill_1`]: effort("r3", 230),
    });
    await flushSnapshots();
    await waitFor(() => expect(result.current.efforts).toHaveLength(3));
    expect(result.current.efforts[0].runId).toBe("r3");
  });

  it("says missing for a deleted segment, and failed for a read that failed, then retries", async () => {
    const gone = renderHook(() => useSegment(ME, "gone"));
    await waitFor(() => expect(gone.result.current.status).toBe("missing"));

    failNextFirestore("getDoc", { path: "segments/hill" });
    const { result } = renderHook(() => useSegment(ME, "hill"));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
});

describe("useSegmentBoard", () => {
  it("reads the board from the callable", async () => {
    H.call.mockResolvedValue({
      data: {
        entries: [
          {
            uid: "bea",
            name: "Bea",
            elapsedSeconds: 240,
            day: "2026-11-09",
            activityId: "p1",
          },
          { uid: "broken" },
        ],
      },
    });
    const { result } = renderHook(() => useSegmentBoard("hill"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(H.call).toHaveBeenCalledWith("getSegmentBoard", {
      segmentId: "hill",
    });
    expect(result.current.entries.map((e) => e.uid)).toEqual(["bea"]);
  });

  it("says when it failed, and reads again on retry", async () => {
    H.call.mockRejectedValueOnce(new Error("unavailable"));
    H.call.mockResolvedValueOnce({ data: { entries: [] } });
    const { result } = renderHook(() => useSegmentBoard("hill"));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("waits until it is asked for", () => {
    const { result } = renderHook(() => useSegmentBoard("hill", false));
    expect(result.current.status).toBe("loading");
    expect(H.call).not.toHaveBeenCalled();
  });
});
