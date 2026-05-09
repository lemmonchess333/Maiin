import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* Mocks Firestore so the trajectory query can be driven from the test
 * with synthetic run + workout snapshots. Each test fixes "now" with
 * vi.useFakeTimers so the week/day-of-week math is deterministic. */

const mockGetDocs = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((..._args: unknown[]) => "col"),
  query: vi.fn((..._args: unknown[]) => "q"),
  where: vi.fn((..._args: unknown[]) => "w"),
  orderBy: vi.fn((..._args: unknown[]) => "o"),
  limit: vi.fn((..._args: unknown[]) => "l"),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  Timestamp: { fromDate: (d: Date) => ({ toMillis: () => d.getTime(), seconds: Math.floor(d.getTime() / 1000) }) },
}));

vi.mock("../firebase", () => ({ db: "mock-db" }));

import { getPersonalTrajectory } from "../personalTrajectory";

const emptySnap = { docs: [] };

describe("getPersonalTrajectory.lastWeekToDate", () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes lastWeekToDate as the elapsed-time-aligned slice of last week", async () => {
    /* Tuesday 14:00 in the current week. Elapsed = ~62 hours into the
       week. lastWeekToDate should query last Sunday 00:00 → last
       Tuesday 14:00. Three Promise.all queries fire (this week, last
       week full, last week to date), each with its own runs+workouts
       getDocs pair = 6 calls total. We assert the call count and the
       resolved shape. */
    vi.setSystemTime(new Date("2026-04-28T14:00:00Z")); // Tuesday
    mockGetDocs.mockResolvedValue(emptySnap);

    const result = await getPersonalTrajectory("user1");

    /* Three Promise.all branches × 2 collections (runs, workouts) = 6 */
    expect(mockGetDocs).toHaveBeenCalledTimes(6);
    expect(result.thisWeek).toEqual({ km: 0, kg: 0, score: 0 });
    expect(result.lastWeek).toEqual({ km: 0, kg: 0, score: 0 });
    expect(result.lastWeekToDate).toEqual({ km: 0, kg: 0, score: 0 });
  });

  it("delta is computed against lastWeekToDate, not lastWeek (the bug PR G fixes)", async () => {
    vi.setSystemTime(new Date("2026-04-28T14:00:00Z")); // Tuesday

    /* Six getDocs calls in order:
       0: this-week runs       — 2 km
       1: this-week workouts   — empty
       2: last-week runs       — 10 km full week
       3: last-week workouts   — empty
       4: last-week-to-date runs — 1 km (Tuesday so far)
       5: last-week-to-date workouts — empty

       thisWeek.score   = 2  km * 100 = 200
       lastWeek.score   = 10 km * 100 = 1000   (NOT used for delta)
       lastWeekToDate   = 1  km * 100 = 100    (USED for delta)
       deltaPct         = (200 - 100) / 100 * 100 = +100%

       Pre-PR-G the delta was (200 - 1000) / 1000 = -80% — the
       misleading negative this test guards against. */
    /* `duration: 60` puts these above the volume floor (30s) so the
       Sprint 1 eligibility filter in personalTrajectory passes them
       through. Tests pre-Sprint-1 didn't need a duration. */
    const runDoc = (km: number) => ({ data: () => ({ distance: km * 1000, duration: 60 }) });
    mockGetDocs
      .mockResolvedValueOnce({ docs: [runDoc(2)] })  // this-week runs
      .mockResolvedValueOnce(emptySnap)              // this-week workouts
      .mockResolvedValueOnce({ docs: [runDoc(10)] }) // last-week runs (full)
      .mockResolvedValueOnce(emptySnap)              // last-week workouts
      .mockResolvedValueOnce({ docs: [runDoc(1)] })  // last-week-to-date runs
      .mockResolvedValueOnce(emptySnap);             // last-week-to-date workouts

    const result = await getPersonalTrajectory("user1");

    expect(result.thisWeek.score).toBe(200);
    expect(result.lastWeek.score).toBe(1000);
    expect(result.lastWeekToDate.score).toBe(100);
    expect(result.deltaPct).toBe(100);
    /* The full-week last-week total stays available for the
       informational baseline row in TrajectoryCard. */
    expect(result.lastWeek.km).toBe(10);
  });

  it("returns deltaPct=null when lastWeekToDate.score is zero (no division)", async () => {
    vi.setSystemTime(new Date("2026-04-28T14:00:00Z"));

    /* `duration: 60` puts these above the volume floor (30s) so the
       Sprint 1 eligibility filter in personalTrajectory passes them
       through. Tests pre-Sprint-1 didn't need a duration. */
    const runDoc = (km: number) => ({ data: () => ({ distance: km * 1000, duration: 60 }) });
    mockGetDocs
      .mockResolvedValueOnce({ docs: [runDoc(3)] })  // this-week runs
      .mockResolvedValueOnce(emptySnap)
      .mockResolvedValueOnce({ docs: [runDoc(5)] })  // last-week full
      .mockResolvedValueOnce(emptySnap)
      .mockResolvedValueOnce(emptySnap)              // last-week-to-date — empty
      .mockResolvedValueOnce(emptySnap);

    const result = await getPersonalTrajectory("user1");

    expect(result.thisWeek.score).toBe(300);
    expect(result.lastWeek.score).toBe(500);
    expect(result.lastWeekToDate.score).toBe(0);
    /* Caller renders "new" copy in this case rather than a -100%. */
    expect(result.deltaPct).toBeNull();
  });
});
