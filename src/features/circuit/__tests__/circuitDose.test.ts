import { describe, expect, it } from "vitest";
import { builtInCircuit, builtInCircuits } from "../builtInCircuits";
import {
  CIRCUIT_WORK_STEP_SECONDS,
  circuitTopLevel,
  doseAt,
  nextLevel,
  type CircuitSessionRecord,
} from "../circuitDose";
import { circuitMoveAllowed } from "../circuitMoves";
import { circuitSeconds } from "../circuitSteps";

const base = builtInCircuit({ kit: "minimal", minutes: 10 });
const low = builtInCircuit({ kit: "minimal", minutes: 10, lowImpact: true });

describe("doseAt: the ladder's rungs (Circ1 (I), STATUS later (1))", () => {
  it("is the circuit itself at rung 0", () => {
    expect(doseAt(base, 0)).toEqual(base);
  });

  it("adds 5 s more work twice, then harder moves one at a time, and never a round", () => {
    const rungs = Array.from({ length: circuitTopLevel(base) + 1 }, (_, i) =>
      doseAt(base, i)
    );
    expect(rungs.length).toBeGreaterThan(3);
    expect(rungs.map((rung) => rung.rounds)).toEqual(
      rungs.map(() => base.rounds)
    );
    expect(rungs.slice(0, 3).map((rung) => rung.workSeconds)).toEqual([
      40, 45, 50,
    ]);
    expect(CIRCUIT_WORK_STEP_SECONDS).toBe(5);
    // Each slot stays a minute: the work comes out of the rest.
    for (const rung of rungs)
      expect(rung.workSeconds + rung.restSeconds).toBe(60);
    // Harder moves, one more at each rung past the work rungs.
    const changed = rungs.map(
      (rung) =>
        rung.moves.filter(
          (move, i) => move.exerciseId !== base.moves[i].exerciseId
        ).length
    );
    expect(changed).toEqual(rungs.map((_, i) => Math.max(0, i - 2)));
    expect(rungs.map((rung) => rung.level)).toEqual(rungs.map((_, i) => i));
  });

  it("keeps every rung of every built-in within its length, and its name true", () => {
    for (const kit of ["minimal", "home_gym", "full_gym"] as const)
      for (const injuries of [[], ["knee"], ["shoulder", "wrist"]])
        for (const circuit of builtInCircuits({ kit, injuries })) {
          const top = circuitTopLevel(circuit, injuries);
          for (let level = 0; level <= top; level++) {
            const rung = doseAt(circuit, level, injuries);
            const seconds = circuitSeconds(rung);
            const where = `${circuit.id} [${injuries.join(",")}] rung ${level}`;
            // The length's band: within its last minute, never over it.
            expect(seconds, where).toBeGreaterThan(circuit.minutes * 60 - 60);
            expect(seconds, where).toBeLessThanOrEqual(circuit.minutes * 60);
            expect(rung.name, where).toBe(circuit.name);
            expect(rung.name, where).toMatch(
              new RegExp(`^${Math.round(seconds / 60)}-minute circuit`)
            );
            expect(rung.id, where).toBe(circuit.id);
          }
        }
  });

  it("holds the rung between 0 and the top", () => {
    const top = circuitTopLevel(base);
    expect(doseAt(base, -3).level).toBe(0);
    expect(doseAt(base, top + 5).level).toBe(top);
    expect(doseAt(base, Number.NaN).level).toBe(0);
    expect(doseAt(base, 2.9).level).toBe(2);
  });

  it("swaps in only harder moves this person may do, never a repeat", () => {
    for (const injuries of [[], ["wrist"], ["lower_back"], ["knee", "wrist"]]) {
      const circuit = builtInCircuit({ kit: "minimal", minutes: 30, injuries });
      const top = doseAt(circuit, 99, injuries);
      for (const move of top.moves)
        expect(
          circuitMoveAllowed(move.exerciseId, {
            kit: circuit.kit,
            injuries,
            lowImpact: circuit.lowImpact,
          }),
          `${injuries.join(",")} ${move.exerciseId}`
        ).toBe(true);
      expect(new Set(top.moves.map((move) => move.exerciseId)).size).toBe(
        new Set(circuit.moves.map((move) => move.exerciseId)).size
      );
    }
  });

  it("never brings a jump into a low-impact circuit", () => {
    const top = doseAt(low, 99);
    expect(top.moves.every((move) => move.impact === "low")).toBe(true);
    // Mountain climbers would step up to burpees at standard impact.
    expect(top.moves.map((move) => move.exerciseId)).toContain(
      "mountain-climbers"
    );
  });

  it("gives low impact its own work rungs, 35/25 then 40/20", () => {
    expect([doseAt(low, 1).workSeconds, doseAt(low, 1).restSeconds]).toEqual([
      35, 25,
    ]);
    expect([doseAt(low, 2).workSeconds, doseAt(low, 2).restSeconds]).toEqual([
      40, 20,
    ]);
  });
});

describe("nextLevel: Easy / Right / Hard steer the ladder (Circ1 (I), STATUS later (4))", () => {
  const at = (
    level: number,
    effort?: CircuitSessionRecord["effort"],
    finished = true
  ): CircuitSessionRecord => ({ level, effort, finished });

  it("starts at rung 0", () => {
    expect(nextLevel([])).toBe(0);
  });

  it("climbs a rung on Easy", () => {
    expect(nextLevel([at(0, "easy")])).toBe(1);
    expect(nextLevel([at(3, "easy")])).toBe(4);
  });

  it("climbs on the second Right in a row at a rung", () => {
    expect(nextLevel([at(2, "right")])).toBe(2);
    expect(nextLevel([at(2, "right"), at(2, "right")])).toBe(3);
    // A Right at the rung below does not count towards this one.
    expect(nextLevel([at(1, "right"), at(2, "right")])).toBe(2);
  });

  it("starts the count again after a Hard between the Rights", () => {
    expect(nextLevel([at(2, "right"), at(2, "hard"), at(2, "right")])).toBe(2);
    expect(
      nextLevel([at(2, "right"), at(2, "hard"), at(2, "right"), at(2, "right")])
    ).toBe(3);
  });

  it("lets an unrated session between the Rights neither count nor break the row", () => {
    expect(nextLevel([at(2, "right"), at(2), at(2, "right")])).toBe(3);
    expect(nextLevel([at(2), at(2, "right")])).toBe(2);
  });

  it("holds on Hard, and steps down on Hard and unfinished", () => {
    expect(nextLevel([at(3, "hard")])).toBe(3);
    expect(nextLevel([at(3, "hard", false)])).toBe(2);
    expect(nextLevel([at(0, "hard", false)])).toBe(0);
  });

  it("holds with no rating", () => {
    expect(nextLevel([at(4)])).toBe(4);
  });

  it("never climbs from an unfinished circuit", () => {
    expect(nextLevel([at(1, "easy", false)])).toBe(1);
    expect(nextLevel([at(1, "right"), at(1, "right", false)])).toBe(1);
  });

  it("is held to the top by doseAt, not by itself", () => {
    const top = circuitTopLevel(base);
    const next = nextLevel([at(top, "easy")]);
    expect(next).toBe(top + 1);
    expect(doseAt(base, next).level).toBe(top);
  });
});
