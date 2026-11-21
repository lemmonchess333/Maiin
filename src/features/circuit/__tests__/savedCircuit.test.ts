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
    // Each move says what kind of step it is and its target's unit, so a
    // later build can store other steps beside it (Hyb1).
    expect(saved.moves).toEqual(
      circuit.moves.map((move) => ({ kind: "move", unit: "seconds", ...move }))
    );
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
    // v2's kinds are not v1's to read (Circ1 STATUS, later (2)).
    ["a kind from a later build", { ...saved, kind: "amrap" }],
    [
      "a sided flag that is not true",
      {
        ...saved,
        moves: [
          {
            exerciseId: "db-row",
            name: "Dumbbell Row",
            impact: "low",
            sided: "yes",
          },
        ],
      },
    ],
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
    [
      "a move that is not a move",
      { ...saved, moves: [{ ...saved.moves[0], kind: "run" }] },
    ],
    [
      "a target in another unit",
      { ...saved, moves: [{ ...saved.moves[0], unit: "metres" }] },
    ],
    [
      "a negative load",
      { ...saved, moves: [{ ...saved.moves[0], loadKg: -5 }] },
    ],
    ["no finished flag", { ...saved, finished: undefined }],
    ["a history flag that is not true", { ...saved, historyUnknown: "yes" }],
  ];
  for (const [what, value] of broken)
    it(`refuses ${what}`, () => {
      expect(readSavedCircuit(value)).toBeNull();
    });
});

describe("a one-sided move", () => {
  it("keeps its flag through the save", () => {
    const withRow = builtInCircuit({ kit: "home_gym", minutes: 20 });
    expect(withRow.moves.some((move) => move.sided)).toBe(true);
    const stored = savedCircuitFrom(withRow, {
      intervalsDone: 20,
      roundsDone: 4,
      workSecondsDone: 800,
      activeSeconds: 1180,
      finished: true,
    });
    expect(readSavedCircuit(JSON.parse(JSON.stringify(stored)))?.moves).toEqual(
      withRow.moves.map((move) => ({ kind: "move", unit: "seconds", ...move }))
    );
  });
});

describe("a circuit chosen while the history could not be read", () => {
  it("keeps its mark through the save, and only then", () => {
    expect("historyUnknown" in saved).toBe(false);
    const blind = savedCircuitFrom(
      { ...circuit, historyUnknown: true },
      {
        intervalsDone: 20,
        roundsDone: 4,
        workSecondsDone: 800,
        activeSeconds: 1180,
        finished: true,
      }
    );
    expect(blind.historyUnknown).toBe(true);
    expect(readSavedCircuit(JSON.parse(JSON.stringify(blind)))).toEqual(blind);
  });
});

describe("a held load", () => {
  it("is read when a later build stores one", () => {
    const loaded = {
      ...saved,
      moves: [{ ...saved.moves[0], loadKg: 16 }],
    };
    expect(readSavedCircuit(loaded)?.moves[0]).toMatchObject({
      kind: "move",
      unit: "seconds",
      loadKg: 16,
    });
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
