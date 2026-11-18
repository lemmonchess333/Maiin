import { describe, expect, it } from "vitest";
import {
  builtInCircuit,
  builtInCircuits,
  CIRCUIT_MINUTES,
  LOW_IMPACT_INTERVAL,
  STANDARD_INTERVAL,
} from "../builtInCircuits";
import {
  CIRCUIT_MOVES,
  circuitMoveAllowed,
  circuitStartersFor,
  type CircuitSlot,
} from "../circuitMoves";
import { contraindicatedFor } from "@/features/program/injurySubstitutions";
import { circuitSeconds } from "../circuitSteps";
import type { CircuitKit } from "../circuitTypes";
import type { InjuryCategory } from "@/features/program/injurySubstitutions";

const KITS: CircuitKit[] = ["minimal", "home_gym", "full_gym"];
const INJURIES: InjuryCategory[] = [
  "knee",
  "shoulder",
  "lower_back",
  "wrist",
  "elbow",
];
/** Every subset of the five injury options: 32 of them. */
const INJURY_SUBSETS: InjuryCategory[][] = Array.from(
  { length: 1 << INJURIES.length },
  (_, mask) => INJURIES.filter((_, bit) => mask & (1 << bit))
);
/** Moves a round asks for, by length (Circ1 (F)). */
const MOVES_IN_A_ROUND = { 10: 5, 20: 5, 30: 6 } as const;
const ROUNDS = { 10: 2, 20: 4, 30: 5 } as const;
const SLOTS = [
  "legs",
  "push",
  "pull",
  "hinge",
  "core",
  "engine",
] as const satisfies readonly CircuitSlot[];

describe("built-in circuits (Circ1 (14), (F))", () => {
  it("covers 32 injury subsets", () => {
    expect(INJURY_SUBSETS).toHaveLength(32);
  });

  for (const kit of KITS)
    for (const minutes of CIRCUIT_MINUTES)
      for (const lowImpact of [false, true])
        it(`${kit}, ${minutes} minutes${lowImpact ? ", low impact" : ""}: right for every injury subset`, () => {
          for (const injuries of INJURY_SUBSETS) {
            const filter = { kit, injuries, lowImpact };
            const circuit = builtInCircuit({ ...filter, minutes });
            const ids = circuit.moves.map((move) => move.exerciseId);
            const where = `${kit} ${minutes} ${lowImpact} [${injuries.join(",")}]`;

            // (F): its moves and rounds, a minute a slot.
            expect(ids, where).toHaveLength(MOVES_IN_A_ROUND[minutes]);
            expect(circuit.rounds, where).toBe(ROUNDS[minutes]);
            expect(circuit.rounds * ids.length, where).toBe(minutes);
            expect(circuit.workSeconds + circuit.restSeconds, where).toBe(60);
            // No rest follows the last interval, so the clock is a rest
            // short of the minutes.
            expect(circuitSeconds(circuit), where).toBe(
              minutes * 60 - circuit.restSeconds
            );

            // (9): every move is one this person may do.
            for (const id of ids)
              expect(circuitMoveAllowed(id, filter), `${where} ${id}`).toBe(
                true
              );
            // (G): no jump at low impact.
            if (lowImpact)
              expect(
                circuit.moves.every((move) => move.impact === "low"),
                where
              ).toBe(true);

            // Distinct while the pool allows; with too few, a move
            // repeats rather than one that is ruled out (H).
            const allowed = new Set(
              SLOTS.flatMap((slot) => circuitStartersFor(slot, filter))
            );
            const distinct = new Set(ids).size;
            expect(distinct, where).toBe(Math.min(ids.length, allowed.size));
            // A repeat never follows itself, and with three moves or more
            // none ends one round and starts the next.
            if (distinct >= 2)
              ids.forEach((id, i) => {
                if (i > 0) expect(id, `${where} @${i}`).not.toBe(ids[i - 1]);
              });
            if (distinct >= 3)
              expect(ids[ids.length - 1], where).not.toBe(ids[0]);
          }
        });

  it("times 40/20, or 30/30 at low impact (Circ1 (14))", () => {
    const standard = builtInCircuit({ kit: "minimal", minutes: 20 });
    const low = builtInCircuit({
      kit: "minimal",
      minutes: 20,
      lowImpact: true,
    });
    expect([standard.workSeconds, standard.restSeconds]).toEqual([
      STANDARD_INTERVAL.workSeconds,
      STANDARD_INTERVAL.restSeconds,
    ]);
    expect([standard.workSeconds, standard.restSeconds]).toEqual([40, 20]);
    expect([low.workSeconds, low.restSeconds]).toEqual([
      LOW_IMPACT_INTERVAL.workSeconds,
      LOW_IMPACT_INTERVAL.restSeconds,
    ]);
    expect([low.workSeconds, low.restSeconds]).toEqual([30, 30]);
  });

  it("names them as (M) says, with a stable id per kit, length and impact", () => {
    const six = builtInCircuits({ kit: "home_gym" });
    expect(six.map((circuit) => circuit.name)).toEqual([
      "10-minute circuit",
      "10-minute circuit, low impact",
      "20-minute circuit",
      "20-minute circuit, low impact",
      "30-minute circuit",
      "30-minute circuit, low impact",
    ]);
    expect(six.map((circuit) => circuit.id)).toEqual([
      "builtin-home_gym-10-standard",
      "builtin-home_gym-10-low",
      "builtin-home_gym-20-standard",
      "builtin-home_gym-20-low",
      "builtin-home_gym-30-standard",
      "builtin-home_gym-30-low",
    ]);
    expect(new Set(six.map((circuit) => circuit.id)).size).toBe(6);
    for (const circuit of six) {
      expect(circuit.kind).toBe("intervals");
      expect(circuit.level).toBe(0);
    }
  });

  it("uses each tier's kit and nothing more (Circ1 (D))", () => {
    const equipment = (kit: CircuitKit) =>
      new Set(
        builtInCircuits({ kit }).flatMap((circuit) =>
          circuit.moves.map((move) => move.exerciseId)
        )
      );
    const minimal = [...equipment("minimal")];
    expect(
      minimal.filter((id) => !circuitMoveAllowed(id, { kit: "minimal" }))
    ).toEqual([]);
    // A home gym's circuits hold dumbbells; a full gym's the kettlebell.
    expect([...equipment("home_gym")].some((id) => id.startsWith("db-"))).toBe(
      true
    );
    expect(equipment("full_gym").has("kettlebell-swing")).toBe(true);
    expect(equipment("minimal").has("kettlebell-swing")).toBe(false);
  });

  it("puts the jump in every standard circuit that may hold one", () => {
    for (const kit of KITS)
      for (const minutes of CIRCUIT_MINUTES) {
        const circuit = builtInCircuit({ kit, minutes });
        expect(
          circuit.moves.some((move) => move.impact === "high"),
          `${kit} ${minutes}`
        ).toBe(true);
      }
  });

  it("holds every injury option's words, one at a time and all together, on no kit (STATUS later (3))", () => {
    for (const injuries of [...INJURIES.map((injury) => [injury]), INJURIES]) {
      for (const minutes of CIRCUIT_MINUTES)
        for (const lowImpact of [false, true]) {
          const circuit = builtInCircuit({
            kit: "minimal",
            minutes,
            lowImpact,
            injuries,
          });
          const where = `${injuries.join(",")} ${minutes} ${lowImpact}`;
          // The pool never empties: repeats fill a short one.
          expect(circuit.moves, where).toHaveLength(MOVES_IN_A_ROUND[minutes]);
          for (const { exerciseId } of circuit.moves) {
            const avoid = CIRCUIT_MOVES[exerciseId].avoid ?? [];
            expect(
              injuries.filter((injury) => avoid.includes(injury)),
              `${where} ${exerciseId}`
            ).toEqual([]);
            expect(contraindicatedFor(exerciseId, injuries), where).toEqual([]);
          }
        }
    }
    const ids = (injuries: string[]) =>
      builtInCircuits({ kit: "minimal", injuries }).flatMap((circuit) =>
        circuit.moves.map((move) => move.exerciseId)
      );
    for (const id of [
      "bodyweight-squat",
      "bodyweight-lunge",
      "mountain-climbers",
    ])
      expect(ids(["knee"]), id).not.toContain(id);
    for (const id of ["push-ups", "pike-push-up", "diamond-push-ups"])
      expect(ids(["shoulder"]), id).not.toContain(id);
    for (const id of ["push-ups", "burpees"])
      expect(ids(["elbow"]), id).not.toContain(id);
  });

  it("opens a beginner on the easy push-up, never a step-up", () => {
    for (const minutes of CIRCUIT_MINUTES) {
      const ids = builtInCircuit({ kit: "minimal", minutes }).moves.map(
        (move) => move.exerciseId
      );
      expect(ids, String(minutes)).toContain("push-ups");
      expect(ids).not.toContain("pike-push-up");
      expect(ids).not.toContain("diamond-push-ups");
    }
  });

  it("marks the one-sided moves, so the runner can say when to switch", () => {
    const sided = Object.entries(CIRCUIT_MOVES)
      .filter(([, move]) => move.sided)
      .map(([id]) => id)
      .sort();
    expect(sided).toEqual(["db-row", "single-leg-calf-raise"]);
    const row = builtInCircuit({ kit: "home_gym", minutes: 20 }).moves.find(
      (move) => move.exerciseId === "db-row"
    );
    expect(row?.sided).toBe(true);
  });

  it("gives the three lengths different circuits, not one at three sizes", () => {
    const [ten, , twenty] = builtInCircuits({ kit: "minimal" });
    expect(ten.moves.map((move) => move.exerciseId)).not.toEqual(
      twenty.moves.map((move) => move.exerciseId)
    );
  });

  it("only uses moves from the pool", () => {
    for (const kit of KITS)
      for (const circuit of builtInCircuits({ kit }))
        for (const move of circuit.moves)
          expect(CIRCUIT_MOVES[move.exerciseId]).toBeDefined();
  });
});
