import { describe, it, expect } from "vitest";
import {
  selectRunRecords,
  isAllTimeRecord,
  PACE_RECORD_MIN_METRES,
  SUSTAINED_RECORD_MIN_METRES,
} from "@/lib/runRecordSelection";

/**
 * The running records card showed two rows carrying the same figure and
 * the same date under two different headings.
 *
 * The 5 km pool is a SUBSET of the 1 km one, so "Best pace" and "Best
 * pace · 5K+" name the same run whenever the best-paced run was already
 * 5 km or longer — which for most runners is most of the time. The
 * filmed rich-history capture showed both reading "5:32 /km · 18 Aug".
 *
 * The sustained row still earns its place when a short blast holds the
 * overall record. So it is returned only when a different run holds it.
 */

let seq = 0;
const run = (distance: number, avgPace: number, day = ++seq) => ({
  distance,
  avgPace,
  completedAt: new Date(2026, 8, day),
});

describe("selectRunRecords", () => {
  it("drops the sustained row when the same run holds both", () => {
    /* The defect. One 8 km run is the fastest thing this person has
       done, so it wins the overall record AND the 5 km one. */
    const fast8k = run(8000, 332);
    const { bestPace, bestSustainedPace } = selectRunRecords([
      fast8k,
      run(6000, 400),
    ]);
    expect(bestPace).toBe(fast8k);
    expect(bestSustainedPace).toBeNull();
  });

  it("keeps it when a short blast holds the overall record", () => {
    // Two genuinely different facts about the same runner.
    const blast = run(1200, 300);
    const long = run(10000, 358);
    const { bestPace, bestSustainedPace } = selectRunRecords([blast, long]);
    expect(bestPace).toBe(blast);
    expect(bestSustainedPace).toBe(long);
  });

  it("compares runs, not paces", () => {
    /* Two DIFFERENT runs that happen to share a pace are two records,
       and the dates beside them say so. A value comparison would have
       collapsed them. */
    const blast = run(1200, 330);
    const long = run(9000, 330);
    const { bestSustainedPace } = selectRunRecords([blast, long]);
    expect(bestSustainedPace).toBe(long);
  });

  it("ignores runs under the pace floor entirely", () => {
    const sprint = run(400, 200);
    const proper = run(5000, 330);
    const { bestPace, bestSustainedPace } = selectRunRecords([sprint, proper]);
    expect(bestPace).toBe(proper);
    // Same run holds both, so the second row has nothing to add.
    expect(bestSustainedPace).toBeNull();
  });

  it("honours both floors exactly", () => {
    const atPaceFloor = run(PACE_RECORD_MIN_METRES, 300);
    const belowPaceFloor = run(PACE_RECORD_MIN_METRES - 1, 200);
    const atSustainedFloor = run(SUSTAINED_RECORD_MIN_METRES, 350);
    const { bestPace, bestSustainedPace } = selectRunRecords([
      belowPaceFloor,
      atPaceFloor,
      atSustainedFloor,
    ]);
    expect(bestPace).toBe(atPaceFloor);
    expect(bestSustainedPace).toBe(atSustainedFloor);
  });

  it("returns no sustained record when nothing reaches 5 km", () => {
    const { bestPace, bestSustainedPace } = selectRunRecords([
      run(3000, 300),
      run(4999, 310),
    ]);
    expect(bestPace).not.toBeNull();
    expect(bestSustainedPace).toBeNull();
  });

  it("longest is by distance, and opt-out-able", () => {
    const far = run(21000, 400);
    const pool = [run(5000, 300), far];
    expect(selectRunRecords(pool).longest).toBe(far);
    expect(
      selectRunRecords(pool, { includeLongest: false }).longest
    ).toBeNull();
  });

  it("handles an empty pool", () => {
    expect(selectRunRecords([])).toEqual({
      bestPace: null,
      bestSustainedPace: null,
      longest: null,
    });
  });

  it("the duplicate it suppresses really was a duplicate", () => {
    /* Anti-tautology: reconstruct the OLD selection and show it produced
       two rows with the same run, so the suppression above is removing a
       real repetition rather than a case that never arose. */
    const pool = [run(8000, 332), run(6000, 400)];
    const oldBest1k = pool
      .filter((r) => r.distance >= 1000)
      .reduce((b, r) => (r.avgPace < b.avgPace ? r : b));
    const oldBest5k = pool
      .filter((r) => r.distance >= 5000)
      .reduce((b, r) => (r.avgPace < b.avgPace ? r : b));
    expect(oldBest5k).toBe(oldBest1k);
    expect(oldBest5k.avgPace).toBe(oldBest1k.avgPace);
    expect(oldBest5k.completedAt).toEqual(oldBest1k.completedAt);
  });
});

describe("isAllTimeRecord", () => {
  /* A "Recent bests" row says New in gold, and gold means a personal
     best. The fastest run of the last 30 days is not one while an older
     run was faster, yet its row said New whenever it fell in the last
     week. */
  const within = (
    pool: ReturnType<typeof run>[],
    ...recent: ReturnType<typeof run>[]
  ) => ({
    allTime: selectRunRecords(pool, { includeLongest: true }),
    recent: selectRunRecords(recent, { includeLongest: true }),
  });

  it("is false for a window's record that an older run beats", () => {
    const older = run(10000, 300, 1);
    const recentRun = run(8000, 320, 25);
    const { allTime, recent } = within([older, recentRun], recentRun);
    expect(isAllTimeRecord(allTime, "bestPace", recent.bestPace!)).toBe(false);
    expect(isAllTimeRecord(allTime, "longest", recent.longest!)).toBe(false);
  });

  it("is true for a window's record that beats every run", () => {
    const older = run(5000, 330, 1);
    const recentRun = run(8000, 320, 25);
    const { allTime, recent } = within([older, recentRun], recentRun);
    expect(isAllTimeRecord(allTime, "bestPace", recent.bestPace!)).toBe(true);
    expect(isAllTimeRecord(allTime, "longest", recent.longest!)).toBe(true);
  });

  it("finds the sustained record on its own row when a short blast holds the overall one", () => {
    const blast = run(1200, 280, 1);
    const long = run(10000, 300, 25);
    const recentBlast = run(1500, 290, 26);
    const { allTime, recent } = within(
      [blast, long, recentBlast],
      long,
      recentBlast
    );
    expect(recent.bestSustainedPace).toBe(long);
    expect(isAllTimeRecord(allTime, "bestSustainedPace", long)).toBe(true);
    expect(isAllTimeRecord(allTime, "bestPace", recentBlast)).toBe(false);
  });

  it("is false for a window's sustained record when one older run holds both", () => {
    // One older 10 km run is the fastest thing overall, so it holds the
    // 5 km record too, and the all-time selection has no separate one.
    const fastest = run(10000, 300, 1);
    const recentBlast = run(1200, 305, 25);
    const recentLong = run(6000, 310, 26);
    const { allTime, recent } = within(
      [fastest, recentBlast, recentLong],
      recentBlast,
      recentLong
    );
    expect(allTime.bestSustainedPace).toBeNull();
    expect(recent.bestSustainedPace).toBe(recentLong);
    expect(isAllTimeRecord(allTime, "bestSustainedPace", recentLong)).toBe(
      false
    );
  });
});
