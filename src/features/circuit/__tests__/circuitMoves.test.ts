import { describe, expect, it } from "vitest";
import { EXERCISES } from "@/lib/exercises";
import { getReleasedFormArtwork } from "@/lib/formArtwork";
import {
  CIRCUIT_MOVES,
  circuitKit,
  circuitMove,
  circuitMoveAllowed,
  harderCircuitMove,
} from "../circuitMoves";

const byId = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));

describe("the circuit move pool (Circ1 (9))", () => {
  it("names only real exercises, each with released art", () => {
    for (const id of Object.keys(CIRCUIT_MOVES)) {
      expect(byId.get(id), id).toBeDefined();
      expect(getReleasedFormArtwork(id), id).not.toBeNull();
    }
  });

  it("points every harder variant at a move in the pool", () => {
    for (const [id, move] of Object.entries(CIRCUIT_MOVES))
      if (move.harder)
        expect(
          CIRCUIT_MOVES[move.harder],
          `${id} → ${move.harder}`
        ).toBeDefined();
  });

  it("tags a move high impact only when both feet leave the floor (Circ1 (G))", () => {
    const high = Object.entries(CIRCUIT_MOVES)
      .filter(([, move]) => move.impact === "high")
      .map(([id]) => id);
    expect(high).toEqual(["burpees"]);
  });

  it("holds each tier to its kit (Circ1 (D))", () => {
    const allowedEquipment = (kit: "minimal" | "home_gym" | "full_gym") =>
      new Set(
        Object.keys(CIRCUIT_MOVES)
          .filter((id) => circuitMoveAllowed(id, { kit }))
          .map((id) => byId.get(id)!.equipment)
      );
    expect([...allowedEquipment("minimal")]).toEqual(["Bodyweight"]);
    expect([...allowedEquipment("home_gym")].sort()).toEqual([
      "Bodyweight",
      "Dumbbells",
    ]);
    expect([...allowedEquipment("full_gym")].sort()).toEqual([
      "Bodyweight",
      "Dumbbells",
      "Kettlebell",
    ]);
  });

  it("reads an unknown kit as minimal (Circ1 (E))", () => {
    expect(circuitKit(undefined)).toBe("minimal");
    expect(circuitKit(null)).toBe("minimal");
    expect(circuitKit("garage")).toBe("minimal");
    expect(circuitKit("home_gym")).toBe("home_gym");
    expect(circuitKit("full_gym")).toBe("full_gym");
  });

  it("leaves out the circuit-only exclusions (Circ1 (H))", () => {
    const allowed = (id: string, injury: string) =>
      circuitMoveAllowed(id, { kit: "full_gym", injuries: [injury] });
    for (const injury of ["knee", "wrist", "lower_back", "shoulder"])
      expect(allowed("burpees", injury), injury).toBe(false);
    expect(allowed("burpees", "elbow")).toBe(true);
    expect(allowed("mountain-climbers", "wrist")).toBe(false);
    expect(allowed("mountain-climbers", "knee")).toBe(true);
    for (const id of ["kettlebell-swing", "bicycle-crunch", "russian-twist"])
      expect(allowed(id, "lower_back"), id).toBe(false);
  });

  it("leaves out a jump at low impact", () => {
    expect(circuitMoveAllowed("burpees", { kit: "minimal" })).toBe(true);
    expect(
      circuitMoveAllowed("burpees", { kit: "minimal", lowImpact: true })
    ).toBe(false);
  });

  it("offers a harder move only when this person may do it", () => {
    expect(harderCircuitMove("mountain-climbers", { kit: "minimal" })).toBe(
      "burpees"
    );
    expect(
      harderCircuitMove("mountain-climbers", {
        kit: "minimal",
        lowImpact: true,
      })
    ).toBeNull();
    expect(
      harderCircuitMove("crunches", {
        kit: "minimal",
        injuries: ["lower_back"],
      })
    ).toBeNull();
    expect(harderCircuitMove("plank", { kit: "minimal" })).toBeNull();
  });

  it("refuses a move outside the pool", () => {
    expect(() => circuitMove("barbell-back-squat")).toThrow();
    expect(circuitMoveAllowed("barbell-back-squat", { kit: "full_gym" })).toBe(
      false
    );
    expect(circuitMove("push-ups")).toEqual({
      exerciseId: "push-ups",
      name: byId.get("push-ups")!.name,
      impact: "low",
    });
  });
});
