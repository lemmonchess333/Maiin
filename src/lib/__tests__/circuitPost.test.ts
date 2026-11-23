/**
 * A circuit post's moves (Circ1 (11)). They are stored as exercise ids,
 * in saved circuits and in posts, and named from the catalogue when drawn
 * (moves stay stored as ids, owner call). So an id any circuit has ever
 * stored has to stay in `EXERCISES` for as long as those keep it, or every
 * old post and saved circuit quietly loses that move; and each has to
 * pass the rules' id check (`isCircuitMoveId` in firestore.rules) to be
 * posted at all.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { builtInCircuits } from "@/features/circuit/builtInCircuits";
import { circuitTopLevel, doseAt } from "@/features/circuit/circuitDose";
import { CIRCUIT_MOVES } from "@/features/circuit/circuitMoves";
import { savedCircuitFrom } from "@/features/circuit/savedCircuit";
import type { CircuitKit } from "@/features/circuit/circuitTypes";
import { circuitPost, circuitPostOf } from "@/lib/circuitPost";
import { EXERCISES } from "@/lib/exercises";

/**
 * Every move a circuit can have stored. It grows with the pool and never
 * shrinks: deleting one of these from the exercise catalogue, or from this
 * list, is deleting a move from circuits people saved and posted.
 */
const STORED_MOVE_IDS = [
  "goblet-squat",
  "bodyweight-squat",
  "bodyweight-lunge",
  "single-leg-calf-raise",
  "push-ups",
  "db-shoulder-press",
  "diamond-push-ups",
  "pike-push-up",
  "db-row",
  "kettlebell-swing",
  "db-rdl",
  "glute-bridge",
  "plank",
  "dead-bug",
  "bicycle-crunch",
  "russian-twist",
  "crunches",
  "burpees",
  "mountain-climbers",
] as const;

const CATALOGUE = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));

/** The rules' own pattern for a move, read from firestore.rules. */
function rulesMovePattern(): RegExp {
  const rules = readFileSync(
    resolve(__dirname, "../../../firestore.rules"),
    "utf8"
  );
  const found = rules.match(
    /function isCircuitMoveId\(m\) \{\s*return m is string && m\.matches\('([^']+)'\);/
  );
  if (!found) throw new Error("isCircuitMoveId not found in firestore.rules");
  return new RegExp(found[1]);
}

const KITS: CircuitKit[] = ["minimal", "home_gym", "full_gym"];

/** Every built-in circuit at every rung of its ladder: each one a
 *  circuit can be saved and posted as. */
const everyCircuit = KITS.flatMap((kit) =>
  builtInCircuits({ kit }).flatMap((base) =>
    Array.from({ length: circuitTopLevel(base) + 1 }, (_, level) =>
      doseAt(base, level)
    )
  )
);

describe("a circuit's stored moves", () => {
  it("are every one still in the exercise catalogue", () => {
    for (const id of STORED_MOVE_IDS)
      expect(CATALOGUE.get(id), `${id} left the catalogue`).toBeDefined();
  });

  it("are listed above for every move the pool holds", () => {
    // A move added to the pool is added to the list, and then held.
    for (const id of Object.keys(CIRCUIT_MOVES))
      expect(STORED_MOVE_IDS, id).toContain(id);
  });

  it("each pass the rules' id check", () => {
    const pattern = rulesMovePattern();
    for (const id of STORED_MOVE_IDS) expect(id, id).toMatch(pattern);
    // The check refuses what is not an id.
    for (const words of ["DM me", "Plank", "", "a b", "x".repeat(61)])
      expect(pattern.test(words), JSON.stringify(words)).toBe(false);
  });
});

describe("a circuit's post", () => {
  it("names every move it posts, at every rung of every circuit", () => {
    const pattern = rulesMovePattern();
    expect(everyCircuit.length).toBeGreaterThan(18);
    for (const circuit of everyCircuit) {
      const post = circuitPost(
        { uid: "author" },
        {
          title: circuit.name,
          circuit: savedCircuitFrom(circuit, {
            intervalsDone: 0,
            roundsDone: 0,
            workSecondsDone: 0,
            activeSeconds: 600,
            finished: false,
          }),
        },
        { visibility: "public" }
      );
      const moves = post.circuit?.moves ?? [];
      const label = `${circuit.id} at ${circuit.level}`;
      // The rules take 1 to 12, each an id.
      expect(moves.length, label).toBeGreaterThanOrEqual(1);
      expect(moves.length, label).toBeLessThanOrEqual(12);
      for (const id of moves) {
        expect(id, label).toMatch(pattern);
        expect(STORED_MOVE_IDS, label).toContain(id);
      }
      // The card names each one: none drops out as unknown.
      expect(
        circuitPostOf(post.circuit)?.moves.map((move) => move.exerciseId),
        label
      ).toEqual(moves);
    }
  });
});
