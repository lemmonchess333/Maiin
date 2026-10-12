import { describe, it, expect } from "vitest";
import {
  automaticStepUp,
  loadGridFor,
  loweredLoad,
  stretchedRepCeiling,
} from "../loadSteps";

const barbell = loadGridFor("bench-press", false);
const smallPlates = loadGridFor("bench-press", true);
const dumbbells = loadGridFor("db-bench", false);
const stack = loadGridFor("lat-pulldown", false);
const kettlebell = loadGridFor("kettlebell-swing", false);

describe("loadGridFor — steps follow the equipment (Lift4 (6))", () => {
  it("steps a barbell 2.5 kg, or 1.25 kg with small plates", () => {
    expect(barbell.above(100)).toBe(102.5);
    expect(smallPlates.above(100)).toBe(101.25);
    // Small plates are a barbell's: a dumbbell rack is the rack either way.
    expect(loadGridFor("db-bench", true).above(20)).toBe(22.5);
  });

  it("steps dumbbells to the next pair: kilos to 10, then 2.5 kg", () => {
    expect(dumbbells.above(8)).toBe(9);
    expect(dumbbells.above(10)).toBe(12.5);
    expect(dumbbells.above(20)).toBe(22.5);
    expect(dumbbells.above(50)).toBe(52.5); // past the rack, by its last gap
  });

  it("steps a machine or cable stack 2.5 kg, and a kettlebell to the next bell", () => {
    expect(stack.above(40)).toBe(42.5);
    expect(loadGridFor("seated-row", false).above(40)).toBe(42.5);
    expect(kettlebell.above(16)).toBe(18);
    expect(kettlebell.above(32)).toBe(36);
  });

  it("steps a bodyweight lift's added load a plate on a belt: 2.5 kg, 1.25 kg with small plates (Pgm8 L6)", () => {
    // One plate hangs from a dip belt, and "I have small plates" means a
    // 1.25 kg step wherever plates go, a barbell's or a belt's.
    expect(loadGridFor("pull-ups", false).above(10)).toBe(12.5);
    expect(loadGridFor("pull-ups", true).above(10)).toBe(11.25);
    expect(loadGridFor("weighted-chest-dip", true).below(2.5)).toBe(1.25);
    expect(loadGridFor("pull-ups", false).nearest(7)).toBe(7.5);
    expect(loadGridFor("pull-ups", false).below(2.5)).toBe(0); // none: the body
  });

  it("steps a lift the catalogue doesn't know as a stack", () => {
    expect(loadGridFor("my-own-lift", false).above(30)).toBe(32.5);
    expect(loadGridFor(undefined, true).above(30)).toBe(32.5);
  });

  it("steps an off-grid weight to the grid above it", () => {
    expect(barbell.above(101)).toBe(102.5);
    expect(dumbbells.above(11.25)).toBe(12.5);
  });

  it("finds the weight below, and none under the lightest", () => {
    expect(barbell.below(100)).toBe(97.5);
    expect(barbell.below(101)).toBe(100);
    expect(dumbbells.below(12.5)).toBe(10);
    expect(dumbbells.below(52.5)).toBe(50);
    expect(dumbbells.below(1)).toBe(0);
  });

  it("finds the nearest weight on the grid, the lighter on a tie", () => {
    expect(barbell.nearest(101)).toBe(100);
    expect(barbell.nearest(101.25)).toBe(100);
    expect(barbell.nearest(102)).toBe(102.5);
    expect(dumbbells.nearest(9.25)).toBe(9);
    expect(dumbbells.nearest(11.25)).toBe(10);
    expect(dumbbells.nearest(0.5)).toBe(1);
  });
});

describe("automaticStepUp — never more than about 15% on its own", () => {
  it("takes a step of 15% or less", () => {
    expect(automaticStepUp(barbell, 20)).toBe(22.5); // 12.5%
    expect(automaticStepUp(dumbbells, 17.5)).toBe(20); // 14.3%
    expect(automaticStepUp(dumbbells, 8)).toBe(9); // 12.5%
  });

  it("leaves a bigger one to the person", () => {
    expect(automaticStepUp(dumbbells, 10)).toBeNull(); // 25%
    expect(automaticStepUp(dumbbells, 15)).toBeNull(); // 16.7%
    expect(automaticStepUp(stack, 15)).toBeNull(); // 16.7%
    expect(automaticStepUp(kettlebell, 12)).toBeNull(); // 16.7%
  });
});

describe("loweredLoad — 10% lighter on the grid, by at least one step", () => {
  it("rounds 10% to the grid", () => {
    expect(loweredLoad(barbell, 100)).toBe(90);
    expect(loweredLoad(barbell, 60)).toBe(55);
    expect(loweredLoad(smallPlates, 60)).toBe(53.75);
    expect(loweredLoad(dumbbells, 20)).toBe(17.5);
  });

  it("comes down a whole step when 10% rounds to nothing", () => {
    expect(loweredLoad(dumbbells, 9)).toBe(8);
    expect(loweredLoad(dumbbells, 12.5)).toBe(10);
    expect(loweredLoad(kettlebell, 16)).toBe(14);
  });
});

describe("stretchedRepCeiling — as far as the next weight's equal effort", () => {
  // By Nuzzo 2024's main table (lifting-evidence §2.15), reps to failure at
  // a share of 1RM, read between its points on log reps. Epley's estimate
  // ran high past 10 reps: 22, 17 and 16 for the first three below, and 26
  // for the 15-rep bottom.
  it("stops where the next weight, for the range's bottom, is as hard", () => {
    // 12 reps is about 75.7% of 1RM, so 12.5 kg for 12 puts 10 kg at about
    // 60.6%: about 19 reps.
    expect(stretchedRepCeiling(10, 12.5, 12)).toBe(19); // dumbbells, 25%
    // 8 reps is about 83.3%; 10 kg is then about 66.6%: about 16 reps.
    expect(stretchedRepCeiling(10, 12.5, 8)).toBe(16);
    // 10 reps is about 79.6%; 15 kg is then about 68.2%: about 15.6 reps.
    expect(stretchedRepCeiling(15, 17.5, 10)).toBe(15); // a stack, 17%
    expect(stretchedRepCeiling(12, 14, 8)).toBe(14); // kettlebells, 17%
  });

  it("reads under the table's lightest load along its last segment", () => {
    // 15 reps is about 69.5%, so 10 kg is about 55.6%, under the table's
    // 60%: the 65–60% segment carried on gives about 21.9 reps.
    expect(stretchedRepCeiling(10, 12.5, 15)).toBe(21);
  });

  it("bridges a bottom under the table's 3.3 reps to 1 rep at 100%", () => {
    // 2 reps is about 97.1% on the bridge, so 10 kg is about 77.7%: about
    // 10.9 reps. Stopping at the table's 95% would make it 11.
    expect(stretchedRepCeiling(10, 12.5, 2)).toBe(10);
  });

  it("never comes in under the range's bottom", () => {
    expect(stretchedRepCeiling(10, 10, 12)).toBe(12);
    expect(stretchedRepCeiling(10, 10, 2)).toBe(2);
  });
});
