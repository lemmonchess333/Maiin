import { describe, expect, it } from "vitest";
import { builtInCircuit } from "../builtInCircuits";
import {
  CIRCUIT_EFFORTS,
  circuitEndLine,
  circuitFeltWords,
  circuitHistorySummary,
  circuitLastTimeLine,
  circuitLevelWords,
  circuitKitLine,
  circuitMinutes,
  circuitPlaceLine,
  circuitShapeLine,
  circuitStepEyebrow,
  circuitStepHeading,
  circuitTooShortLine,
} from "../circuitCopy";
import { circuitSteps } from "../circuitSteps";

const circuit = builtInCircuit({ kit: "minimal", minutes: 10 });
const steps = circuitSteps(circuit);

describe("circuit mode's words", () => {
  it("says what a circuit asks for and how it runs", () => {
    expect(circuitKitLine("minimal")).toBe("Bodyweight only");
    expect(circuitKitLine("home_gym")).toBe("Bodyweight and dumbbells");
    expect(circuitKitLine("full_gym")).toBe(
      "Bodyweight, dumbbells and a kettlebell"
    );
    expect(circuitShapeLine(circuit)).toBe(
      "10 min · 5 moves · 2 rounds · 40 s on, 20 s off"
    );
    // At a rung with an extra round, the minutes say so.
    expect(circuitShapeLine({ ...circuit, rounds: 3 })).toBe(
      "15 min · 5 moves · 3 rounds · 40 s on, 20 s off"
    );
  });

  it("names the step and where you are in the circuit", () => {
    const [ready, work, rest] = steps;
    expect(circuitStepEyebrow(ready.kind)).toBe("Get ready");
    expect(circuitStepEyebrow(work.kind)).toBe("Work");
    expect(circuitStepEyebrow(rest.kind)).toBe("Rest");
    expect(circuitStepHeading(work)).toBe(circuit.moves[0].name);
    expect(circuitStepHeading(rest)).toBe(`Next: ${circuit.moves[1].name}`);
    expect(circuitPlaceLine(circuit, ready)).toBe("Round 1 of 2 · Move 1 of 5");
    expect(circuitPlaceLine(circuit, work)).toBe("Round 1 of 2 · Move 1 of 5");
    // A rest points at the move it leads to.
    expect(circuitPlaceLine(circuit, rest)).toBe("Round 1 of 2 · Move 2 of 5");
    // The rest between rounds leads into the next round.
    const turn = steps.find(
      (step) => step.kind === "rest" && step.interval === 5
    )!;
    expect(circuitPlaceLine(circuit, turn)).toBe("Round 2 of 2 · Move 1 of 5");
    expect(circuitPlaceLine(circuit, steps[steps.length - 1])).toBe(
      "Round 2 of 2 · Move 5 of 5"
    );
  });

  it("says whether an ended circuit is saved (Circ1 (A))", () => {
    expect(circuitEndLine(300, false)).toBe(
      "You’ve done 5 min. A circuit saves from 7 min, so this one won’t be saved."
    );
    expect(circuitEndLine(725, true)).toBe(
      "You’ve done 12 min. You can save it as it stands."
    );
    expect(circuitTooShortLine(130)).toBe(
      "You did 2 min. A circuit saves from 7 min."
    );
    expect(circuitMinutes(0)).toBe(0);
    expect(circuitMinutes(20)).toBe(1);
  });

  it("offers Easy, Right and Hard (Circ1 (2))", () => {
    expect(CIRCUIT_EFFORTS.map((choice) => choice.label)).toEqual([
      "Easy",
      "Right",
      "Hard",
    ]);
  });
});

describe("circuit history's words", () => {
  it("says the level from 1, and the last time with how it felt", () => {
    expect(circuitLevelWords(0)).toBe("Level 1");
    expect(circuitLevelWords(3)).toBe("Level 4");
    expect(
      circuitLastTimeLine(
        { level: 1 },
        { day: "2026-11-12", saved: { effort: "right" } }
      )
    ).toBe("Level 2 · last time 12 Nov, felt right");
    expect(
      circuitLastTimeLine({ level: 0 }, { day: "2026-11-02", saved: {} })
    ).toBe("Level 1 · last time 2 Nov");
  });

  it("sums a saved circuit up for History and says how it felt", () => {
    expect(
      circuitHistorySummary({
        roundsDone: 1,
        moves: circuit.moves.slice(0, 1).map((move) => ({
          kind: "move" as const,
          unit: "seconds" as const,
          ...move,
        })),
        activeSeconds: 600,
      })
    ).toEqual(["10 min", "1 round", "1 move"]);
    expect(circuitFeltWords("hard")).toBe("Felt hard");
    expect(circuitFeltWords(undefined)).toBe("No rating");
  });
});
