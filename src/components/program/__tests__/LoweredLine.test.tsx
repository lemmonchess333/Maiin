import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import LoweredLine from "../LoweredLine";
import type { ProgramExercise } from "@/features/program/programTypes";

type Shown = Pick<
  ProgramExercise,
  "exerciseId" | "lowered" | "weight" | "reps" | "repUnit"
>;

const line = (exercise: Shown) =>
  render(<LoweredLine exercise={exercise} />).container;

const bench = (over: Partial<Shown> = {}): Shown => ({
  exerciseId: "bench-press",
  weight: 90,
  reps: 5,
  lowered: { exerciseId: "bench-press", from: 100, unit: "kg", target: 5 },
  ...over,
});

describe("LoweredLine — the one line after the plan lowers a lift (Lift4 (3))", () => {
  it("names the weight it came down from and the reps it missed", () => {
    expect(line(bench())).toHaveTextContent(
      "Down from 100 kg: two sessions under 5 reps"
    );
  });

  it("says seconds for a weighted hold", () => {
    expect(
      line({
        exerciseId: "farmers-carry",
        weight: 21.25,
        reps: 40,
        repUnit: "seconds",
        lowered: {
          exerciseId: "farmers-carry",
          from: 24,
          unit: "kg",
          target: 40,
        },
      })
    ).toHaveTextContent("Down from 24 kg: two sessions under 40s");
  });

  it("says reps or seconds for a bodyweight lift or hold", () => {
    expect(
      line({
        exerciseId: "pull-ups",
        weight: 0,
        reps: 7,
        lowered: { exerciseId: "pull-ups", from: 8, unit: "reps", target: 8 },
      })
    ).toHaveTextContent("Down from 8 reps: two sessions under 8");
    expect(
      line({
        exerciseId: "plank",
        weight: 0,
        reps: 40,
        repUnit: "seconds",
        lowered: { exerciseId: "plank", from: 45, unit: "s", target: 45 },
      })
    ).toHaveTextContent("Down from 45s: two sessions under 45s");
  });

  it("says nothing once the session that showed it is finished", () => {
    const shown = bench().lowered!;
    expect(
      line(bench({ lowered: { ...shown, shown: true } }))
    ).toBeEmptyDOMElement();
  });

  it("says nothing once the lift is back where it came down from", () => {
    // As when the old weight is typed back in.
    expect(line(bench({ weight: 100 }))).toBeEmptyDOMElement();
  });

  it("says nothing for a lift the plan didn't lower, or a record a swap left", () => {
    expect(line(bench({ lowered: undefined }))).toBeEmptyDOMElement();
    expect(
      line(bench({ exerciseId: "incline-bench-press" }))
    ).toBeEmptyDOMElement();
  });
});
