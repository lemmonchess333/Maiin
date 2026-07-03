import { describe, it, expect } from "vitest";
import {
  suggestNextLoad,
  INCREMENT_KG,
} from "../progressionSuggestion";

const sets = (weight: number, ...reps: number[]) =>
  reps.map((r) => ({ weight, reps: r }));

describe("suggestNextLoad (double progression)", () => {
  it("suggests +2.5kg when every working set hit target reps", () => {
    expect(
      suggestNextLoad({ prevSets: sets(60, 8, 8, 8), targetReps: 8 })
    ).toEqual({
      kind: "increase",
      weightKg: 60 + INCREMENT_KG,
      lastWeightKg: 60,
      targetReps: 8,
    });
  });

  it("suggests repeating the weight when any set fell short", () => {
    expect(
      suggestNextLoad({ prevSets: sets(60, 8, 8, 7), targetReps: 8 })
    ).toEqual({
      kind: "repeat",
      weightKg: 60,
      lastWeightKg: 60,
      targetReps: 8,
    });
  });

  it("exceeding target still counts as hit", () => {
    expect(
      suggestNextLoad({ prevSets: sets(60, 10, 9, 8), targetReps: 8 })?.kind
    ).toBe("increase");
  });

  it("returns null for bodyweight rows, empty history, bad targets", () => {
    expect(suggestNextLoad({ prevSets: sets(0, 12, 12), targetReps: 12 })).toBeNull();
    expect(suggestNextLoad({ prevSets: [], targetReps: 8 })).toBeNull();
    expect(suggestNextLoad({ prevSets: sets(60, 8), targetReps: 0 })).toBeNull();
    expect(suggestNextLoad({ prevSets: sets(60, 8), targetReps: NaN })).toBeNull();
  });

  it("returns null for pyramid schemes (no single honest next weight)", () => {
    expect(
      suggestNextLoad({
        prevSets: [
          { weight: 60, reps: 10 },
          { weight: 70, reps: 8 },
          { weight: 80, reps: 6 },
        ],
        targetReps: 6,
      })
    ).toBeNull();
  });

  it("ignores bodyweight warmup rows mixed into a weighted session", () => {
    expect(
      suggestNextLoad({
        prevSets: [{ weight: 0, reps: 15 }, ...sets(60, 8, 8)],
        targetReps: 8,
      })?.kind
    ).toBe("increase");
  });

  it("respects a custom increment", () => {
    expect(
      suggestNextLoad({
        prevSets: sets(100, 5, 5, 5),
        targetReps: 5,
        incrementKg: 5,
      })?.weightKg
    ).toBe(105);
  });
});
