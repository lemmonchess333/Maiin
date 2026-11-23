/**
 * useRunSegmentEfforts (Run26 call 3): a saved run's segment efforts, live,
 * each with its segment and its place among the runner's own efforts there,
 * in the order they were run. An effort whose segment has gone is left out.
 *
 * Firestore runs on the one fake (ADR-0009), seeded with the fields the
 * server writes (functions/lib/segments.js).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import { useRunSegmentEfforts } from "../useRunSegmentEfforts";
import {
  failNextFirestore,
  flushSnapshots,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

const UID = "runner";
const line = [
  { lat: 51.4433, lon: -0.1517 },
  { lat: 51.4433, lon: -0.1373 },
];
const segment = (name: string, lengthMeters = 1000) => ({
  name,
  lengthMeters,
  points: line,
  start: line[0],
  end: line[1],
  startCell: "gcpuc",
  createdAtMs: 1,
});
const effort = (
  segmentId: string,
  runId: string,
  elapsedSeconds: number,
  startedAtMs: number,
  lap = 1
) => ({
  uid: UID,
  segmentId,
  runId,
  lap,
  elapsedSeconds,
  startedAtMs,
  day: "2026-11-10",
  start: line[0],
  end: line[1],
  createdAtMs: 1,
});
const path = (runId: string, segmentId: string, lap = 1) =>
  `users/${UID}/segmentEfforts/${runId}_${segmentId}_${lap}`;

beforeEach(() => {
  resetFirestore();
  seedFirestore({
    "segments/hill": segment("Hill"),
    "segments/flat": segment("Flat", 2000),
    // This run: the flat first, then the hill.
    [path("r1", "flat")]: effort("flat", "r1", 500, 2000),
    [path("r1", "hill")]: effort("hill", "r1", 260, 5000),
    // Earlier runs on the hill, one faster and one slower.
    [path("r0", "hill")]: effort("hill", "r0", 250, 100),
    [path("rx", "hill")]: effort("hill", "rx", 270, 50),
  });
});

describe("useRunSegmentEfforts", () => {
  it("lists the run's efforts in the order run, each ranked among the runner's own", async () => {
    const { result } = renderHook(() => useRunSegmentEfforts(UID, "r1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(
      result.current.rows.map((r) => [r.segment.name, r.rank, r.of])
    ).toEqual([
      ["Flat", 1, 1],
      ["Hill", 2, 3],
    ]);
    expect(result.current.failed).toBe(false);
  });

  it("adds an effort the server writes while the run is open", async () => {
    const { result } = renderHook(() => useRunSegmentEfforts(UID, "r1"));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    seedFirestore({
      [path("r1", "hill", 2)]: effort("hill", "r1", 240, 6000, 2),
    });
    await flushSnapshots();
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.rows[2]).toMatchObject({ rank: 1, of: 4 });
  });

  it("leaves out an effort whose segment has been deleted", async () => {
    resetFirestore();
    seedFirestore({
      "segments/hill": segment("Hill"),
      [path("r1", "gone")]: effort("gone", "r1", 300, 1),
      [path("r1", "hill")]: effort("hill", "r1", 260, 2),
    });
    const { result } = renderHook(() => useRunSegmentEfforts(UID, "r1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows.map((r) => r.segment.id)).toEqual(["hill"]);
  });

  it("is empty, not loading, for a run with none", async () => {
    const { result } = renderHook(() => useRunSegmentEfforts(UID, "r9"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([]);
  });

  it("says when the efforts could not be read", async () => {
    failNextFirestore("onSnapshot");
    const { result } = renderHook(() => useRunSegmentEfforts(UID, "r1"));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(unfiredFailures()).toEqual([]);
  });

  it("with a window, adds what lands inside it and stops listening after", async () => {
    /* The run finish's bounded wait (Run30 call 1): real timers, a short
       window. */
    const { result } = renderHook(() =>
      useRunSegmentEfforts(UID, "r1", { listenMs: 80 })
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    seedFirestore({
      [path("r1", "hill", 2)]: effort("hill", "r1", 240, 6000, 2),
    });
    await flushSnapshots();
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.rows[2].own).toHaveLength(4);
    await new Promise((r) => setTimeout(r, 120));
    seedFirestore({
      [path("r1", "flat", 2)]: effort("flat", "r1", 480, 7000, 2),
    });
    await flushSnapshots();
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.rows).toHaveLength(3);
    expect(result.current.loading).toBe(false);
  });

  it("reads nothing signed out", () => {
    const { result } = renderHook(() => useRunSegmentEfforts(null, "r1"));
    expect(result.current).toEqual({ loading: false, failed: false, rows: [] });
  });
});
