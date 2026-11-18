import { describe, expect, it } from "vitest";
import { builtInCircuit } from "../builtInCircuits";
import {
  CIRCUIT_FORMAT,
  readSavedCircuit,
  savedCircuitFrom,
  workoutCircuit,
  type SavedCircuit,
} from "../savedCircuit";

const circuit = builtInCircuit({ kit: "home_gym", minutes: 20 });
const saved: SavedCircuit = savedCircuitFrom(circuit, {
  intervalsDone: 20,
  roundsDone: 4,
  workSecondsDone: 800,
  activeSeconds: 1180.4,
  finished: true,
  effort: "right",
});

describe("savedCircuitFrom (Circ1 (4), (B))", () => {
  it("keeps the circuit as run and what was done of it", () => {
    expect(saved).toMatchObject({
      circuitId: circuit.id,
      name: "20-minute circuit",
      kind: "intervals",
      kit: "home_gym",
      minutes: 20,
      lowImpact: false,
      level: 0,
      workSeconds: 40,
      restSeconds: 20,
      rounds: 4,
      intervalsDone: 20,
      roundsDone: 4,
      workSecondsDone: 800,
      activeSeconds: 1180,
      finished: true,
      effort: "right",
    });
    expect(saved.moves).toEqual(circuit.moves);
  });

  it("leaves out an effort that was not given", () => {
    const unrated = savedCircuitFrom(circuit, {
      intervalsDone: 8,
      roundsDone: 1,
      workSecondsDone: 320,
      activeSeconds: 480,
      finished: false,
    });
    expect("effort" in unrated).toBe(false);
    expect(readSavedCircuit(unrated)).toEqual(unrated);
  });
});

describe("readSavedCircuit", () => {
  it("reads back what was saved", () => {
    expect(readSavedCircuit(saved)).toEqual(saved);
    expect(readSavedCircuit(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  const broken: [string, unknown][] = [
    ["nothing", undefined],
    ["a string", "circuit"],
    ["no id", { ...saved, circuitId: "" }],
    ["an unknown kind", { ...saved, kind: "tabata" }],
    ["an unknown kit", { ...saved, kit: "garage" }],
    ["an unknown length", { ...saved, minutes: 15 }],
    ["a text impact flag", { ...saved, lowImpact: "no" }],
    ["a negative count", { ...saved, roundsDone: -1 }],
    ["a missing count", { ...saved, activeSeconds: undefined }],
    ["an infinite count", { ...saved, workSeconds: Infinity }],
    ["no moves", { ...saved, moves: [] }],
    ["moves that are not a list", { ...saved, moves: "squat" }],
    [
      "a move with no name",
      { ...saved, moves: [{ exerciseId: "plank", impact: "low" }] },
    ],
    [
      "a move with an unknown impact",
      {
        ...saved,
        moves: [{ exerciseId: "plank", name: "Plank", impact: "mid" }],
      },
    ],
    ["an unknown effort", { ...saved, effort: "brutal" }],
    ["no finished flag", { ...saved, finished: undefined }],
  ];
  for (const [what, value] of broken)
    it(`refuses ${what}`, () => {
      expect(readSavedCircuit(value)).toBeNull();
    });
});

describe("workoutCircuit", () => {
  it("reads a circuit only from a workout marked as one", () => {
    expect(CIRCUIT_FORMAT).toBe("circuit");
    expect(workoutCircuit({ format: "circuit", circuit: saved })).toEqual(
      saved
    );
    expect(workoutCircuit({ circuit: saved })).toBeNull();
    expect(workoutCircuit({ format: "circuit" })).toBeNull();
    expect(workoutCircuit({})).toBeNull();
  });
});
