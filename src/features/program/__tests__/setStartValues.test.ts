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

  it("is the plan's rows when there was no last time", () => {
    expect(
      values(startingSetRows(rows(60, 8), { weight: 60, reps: 8 }, undefined))
    ).toEqual(["60x8", "60x8", "60x8"]);
  });
});
