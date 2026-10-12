import { describe, it, expect } from "vitest";
import { startingSetRows } from "../setStartValues";

/** Rows as a new session builds them: a warm-up, then the plan's sets. */
function rows(weight: number, reps: number, working = 3, warmups = 0) {
  return [
    ...Array.from({ length: warmups }, () => ({
      type: "warmup",
      weight: 20,
      reps: 10,
    })),
    ...Array.from({ length: working }, () => ({
      type: "working",
      weight,
      reps,
    })),
  ];
}

const values = (out: { weight: number; reps: number }[]) =>
  out.map((row) => `${row.weight}x${row.reps}`);

describe("startingSetRows — each set starts from what it did last time (Lift4)", () => {
  it("starts the sets at the weight followed from the plan, where its step lands", () => {
    const out = startingSetRows(rows(62.5, 8), { weight: 62.5, reps: 8 }, [
      { weight: 60, reps: 12 },
      { weight: 60, reps: 12 },
      { weight: 60, reps: 12 },
    ]);
    expect(values(out)).toEqual(["62.5x8", "62.5x8", "62.5x8"]);
  });

  it("keeps a top set as lifted", () => {
    const out = startingSetRows(rows(92.5, 5), { weight: 92.5, reps: 5 }, [
      { weight: 100, reps: 3 },
      { weight: 90, reps: 5 },
      { weight: 90, reps: 5 },
    ]);
    expect(values(out)).toEqual(["100x3", "92.5x5", "92.5x5"]);
  });

  it("keeps a lighter last set as lifted", () => {
    const out = startingSetRows(rows(60, 11), { weight: 60, reps: 11 }, [
      { weight: 60, reps: 10 },
      { weight: 60, reps: 10 },
      { weight: 50, reps: 10 },
    ]);
    expect(values(out)).toEqual(["60x11", "60x11", "50x10"]);
  });

  it("leaves warm-ups on their ramp and pairs sets past them", () => {
    const out = startingSetRows(rows(60, 8, 3, 2), { weight: 60, reps: 8 }, [
      { weight: 60, reps: 8 },
      { weight: 60, reps: 8 },
      { weight: 50, reps: 8 },
    ]);
    expect(values(out)).toEqual(["20x10", "20x10", "60x8", "60x8", "50x8"]);
  });

  it("starts a set with none last time from the plan", () => {
    const out = startingSetRows(rows(60, 8, 4), { weight: 60, reps: 8 }, [
      { weight: 60, reps: 8 },
      { weight: 50, reps: 8 },
    ]);
    // Last time's followed weight is the heavier of a tie, 60.
    expect(values(out)).toEqual(["60x8", "50x8", "60x8", "60x8"]);
  });

  it("takes each set's weight from last time when the plan has none yet", () => {
    const out = startingSetRows(rows(0, 10), { weight: 0, reps: 10 }, [
      { weight: 40, reps: 10 },
      { weight: 40, reps: 9 },
    ]);
    expect(values(out)).toEqual(["40x10", "40x10", "40x10"]);
  });

  it("starts from none where the plan's own drop took a bodyweight lift's load to none (Pgm8 L6)", () => {
    // Two misses at 2.5 kg on the belt lower it a plate, to none. Last
    // time's 2.5 kg is the load the plan came down from: the rows start
    // where it came down to, as a lowered weight's do. Logged as filled,
    // the 2.5 kg would undo the drop.
    const pullUps = {
      exerciseId: "pull-ups",
      weight: 0,
      reps: 8,
      lowered: {
        exerciseId: "pull-ups",
        from: 2.5,
        unit: "kg" as const,
        target: 8,
      },
    };
    const last = [
      { weight: 2.5, reps: 6 },
      { weight: 2.5, reps: 5 },
      { weight: 2.5, reps: 5 },
    ];
    expect(values(startingSetRows(rows(0, 8), pullUps, last))).toEqual([
      "0x8",
      "0x8",
      "0x8",
    ]);
    // A record a swap left on another lift says nothing about this one.
    const swapped = { ...pullUps, exerciseId: "chin-ups" };
    expect(values(startingSetRows(rows(0, 8), swapped, last))).toEqual([
      "2.5x8",
      "2.5x8",
      "2.5x8",
    ]);
    // A loaded lift at 0 kg has no weight yet, whatever brought it there.
    const pulldown = {
      ...pullUps,
      exerciseId: "lat-pulldown",
      lowered: { ...pullUps.lowered, exerciseId: "lat-pulldown" },
    };
    expect(values(startingSetRows(rows(0, 8), pulldown, last))).toEqual([
      "2.5x8",
      "2.5x8",
      "2.5x8",
    ]);
  });

  it("is the plan's rows when there was no last time", () => {
    expect(
      values(startingSetRows(rows(60, 8), { weight: 60, reps: 8 }, undefined))
    ).toEqual(["60x8", "60x8", "60x8"]);
  });
});
