import { describe, it, expect } from "vitest";
import { bestSetsByReps, MAX_REP_BUCKETS } from "@/lib/repBuckets";

/**
 * The "Personal bests by reps" columns are the rep counts this lifter
 * trains, read off their own sets.
 *
 * They were the constant `[1, 3, 5, 10]`, matched exactly, so 2, 4, 6,
 * 7, 8, 9, 11 and 12 produced nothing — a lifter programming eights saw
 * four em-dashes for as long as they trained that way, directly beneath
 * a "Best 1RM" estimate computed from those very sets.
 *
 * Widening the fixed buckets into ranges was refused: it would file an
 * eight-rep set under "10RM", claiming a performance the lifter never
 * gave. Reading the counts off the sets keeps every `{n}RM` label
 * exactly true and fills the card, which is the option that did not
 * require choosing between the two.
 */

const s = (date: string, sets: [number, number][]) => ({
  date,
  sets: sets.map(([reps, weightKg]) => ({ reps, weightKg })),
});

describe("bestSetsByReps", () => {
  it("serves a lifter who only ever does eights", () => {
    /* The headline case. Under the fixed buckets this returned nothing
       at all — four blanks, forever. */
    const out = bestSetsByReps([
      s("2026-09-01", [[8, 60]]),
      s("2026-09-08", [[8, 65]]),
    ]);
    expect(out).toEqual([{ reps: 8, weightKg: 65, date: "2026-09-08" }]);
  });

  it("keeps the heaviest set at each rep count", () => {
    const out = bestSetsByReps([
      s("2026-09-01", [
        [5, 100],
        [5, 90],
      ]),
    ]);
    expect(out).toEqual([{ reps: 5, weightKg: 100, date: "2026-09-01" }]);
  });

  it("returns ascending by reps, so the row runs heavy to light", () => {
    const out = bestSetsByReps([
      s("2026-09-01", [
        [10, 50],
        [3, 90],
        [8, 60],
        [5, 80],
      ]),
    ]);
    expect(out.map((r) => r.reps)).toEqual([3, 5, 8, 10]);
  });

  it("picks the MOST-TRAINED counts when there are more than fit", () => {
    /* Programming, not outliers: a single curiosity double must not
       displace a rep count the lifter runs every week. */
    const out = bestSetsByReps([
      s("2026-09-01", [
        [2, 120],
        [5, 100],
        [5, 100],
        [8, 70],
        [8, 70],
        [8, 70],
        [10, 60],
        [10, 60],
        [12, 50],
        [12, 50],
        [12, 50],
        [12, 50],
      ]),
    ]);
    expect(out.map((r) => r.reps)).toEqual([5, 8, 10, 12]);
    expect(out.map((r) => r.reps)).not.toContain(2);
  });

  it("never returns more columns than the grid has", () => {
    const sets = Array.from(
      { length: 12 },
      (_, i) => [i + 1, 100 - i] as [number, number]
    );
    expect(bestSetsByReps([s("2026-09-01", sets)])).toHaveLength(
      MAX_REP_BUCKETS
    );
  });

  it("breaks a tie towards the lower rep count", () => {
    // Deterministic, and leans the card to the heavier end.
    const out = bestSetsByReps(
      [
        s("2026-09-01", [
          [3, 90],
          [12, 40],
        ]),
      ],
      1
    );
    expect(out.map((r) => r.reps)).toEqual([3]);
  });

  it("dates a repeated best to the FIRST time it was reached", () => {
    /* Matching a best does not reset its date — that is when you did it.
       The comparison has to be strictly greater, not >=. */
    const out = bestSetsByReps([
      s("2026-09-01", [[5, 100]]),
      s("2026-09-08", [[5, 100]]),
    ]);
    expect(out[0].date).toBe("2026-09-01");
  });

  it("dates the session that set the record, not the latest session", () => {
    const out = bestSetsByReps([
      s("2026-09-01", [[5, 100]]),
      s("2026-09-08", [[5, 80]]),
    ]);
    expect(out[0].date).toBe("2026-09-01");
  });

  it("keeps a bodyweight record at zero added weight", () => {
    // The card renders this as "BW" — it must not be mistaken for absent.
    const out = bestSetsByReps([s("2026-09-01", [[12, 0]])]);
    expect(out).toEqual([{ reps: 12, weightKg: 0, date: "2026-09-01" }]);
  });

  it("ignores sets with no usable rep count", () => {
    const out = bestSetsByReps([
      s("2026-09-01", [
        [0, 100],
        [-1, 100],
        [5, 80],
      ]),
    ]);
    expect(out.map((r) => r.reps)).toEqual([5]);
  });

  it("returns nothing for a lifter with no sets", () => {
    expect(bestSetsByReps([])).toEqual([]);
    expect(bestSetsByReps([s("2026-09-01", [])])).toEqual([]);
  });

  it("is NOT the old fixed set", () => {
    /* The regression this exists to stop: hard-coding the columns again
       would return 1/3/5/10 for a lifter who trains none of them. */
    const out = bestSetsByReps([
      s("2026-09-01", [
        [6, 80],
        [7, 75],
      ]),
    ]);
    expect(out.map((r) => r.reps)).toEqual([6, 7]);
  });
});
