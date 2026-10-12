import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import StretchedLine from "../StretchedLine";
import type { ProgramExercise } from "@/features/program/programTypes";

type Shown = Pick<
  ProgramExercise,
  "exerciseId" | "stretched" | "weight" | "repUnit"
>;

const line = (exercise: Shown) =>
  render(<StretchedLine exercise={exercise} />).container;

const raise = (over: Partial<Shown> = {}): Shown => ({
  exerciseId: "lateral-raise",
  weight: 10,
  stretched: {
    exerciseId: "lateral-raise",
    weight: 10,
    next: 12.5,
    ceiling: 19,
  },
  ...over,
});

describe("StretchedLine — the one line when a target climbs past its range (Pgm7 A3)", () => {
  it("names how far the reps go, on which weight, and the jump to the next", () => {
    expect(line(raise())).toHaveTextContent(
      "Up to 19 reps on 10 kg: 12.5 kg is a big jump"
    );
  });

  it("says seconds for a weighted hold", () => {
    expect(
      line({
        exerciseId: "farmers-carry",
        weight: 10,
        repUnit: "seconds",
        stretched: {
          exerciseId: "farmers-carry",
          weight: 10,
          next: 12.5,
          ceiling: 47,
        },
      })
    ).toHaveTextContent("Up to 47s on 10 kg: 12.5 kg is a big jump");
  });

  it("keeps every number in the numeral face", () => {
    const numbers = [...line(raise()).querySelectorAll("span")].map((span) => [
      span.textContent,
      span.className,
    ]);
    expect(numbers).toEqual([
      ["19", "font-mono tabular-nums"],
      ["10", "font-mono tabular-nums"],
      ["12.5", "font-mono tabular-nums"],
    ]);
  });

  it("says nothing once the plan is on a heavier weight, as when the heavier pair is picked up", () => {
    expect(line(raise({ weight: 12.5 }))).toBeEmptyDOMElement();
  });

  it("still says it in an easier session, whose weights are lighter by design", () => {
    // Easier today lifts 85% of the plan's weight: 10 kg dumbbells become
    // 9 kg ones. The line names the plan's weight, so it stays true.
    expect(line(raise({ weight: 9 }))).toHaveTextContent(
      "Up to 19 reps on 10 kg: 12.5 kg is a big jump"
    );
  });

  it("says nothing for a lift the plan didn't stretch, or a record a swap left", () => {
    expect(line(raise({ stretched: undefined }))).toBeEmptyDOMElement();
    expect(
      line(raise({ exerciseId: "cable-lateral-raise" }))
    ).toBeEmptyDOMElement();
  });
});
