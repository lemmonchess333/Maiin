import { describe, expect, it } from "vitest";
import { builtInCircuits } from "../builtInCircuits";
import { circuitTopLevel, doseAt } from "../circuitDose";
import {
  circuitForToday,
  circuitReward,
  savedCircuits,
} from "../circuitHistory";
import {
  CIRCUIT_FORMAT,
  savedCircuitFrom,
  type CircuitOutcome,
} from "../savedCircuit";
import type { Circuit } from "../circuitTypes";

/**
 * The circuit history (Circ1 (7), (11)): which saved workouts are
 * circuits, in which order the ladder reads them, and the first-circuit
 * reward.
 */
const base = builtInCircuits({ kit: "minimal" })[0];

const FULL: CircuitOutcome = {
  intervalsDone: 10,
  roundsDone: 2,
  workSecondsDone: 400,
  activeSeconds: 580,
  finished: true,
};

/** A saved workout holding the circuit, as the read returns it. */
function workout(
  date: string,
  savedAtSeconds: number,
  outcome: Partial<CircuitOutcome>,
  circuit: Circuit = base
) {
  return {
    date,
    createdAt: {
      seconds: savedAtSeconds,
      toMillis: () => savedAtSeconds * 1000,
    },
    format: CIRCUIT_FORMAT,
    circuit: savedCircuitFrom(circuit, { ...FULL, ...outcome }),
  };
}

describe("savedCircuits", () => {
  it("keeps only the circuits", () => {
    const lift = { date: "2026-11-10", exercises: [] };
    expect(
      savedCircuits([lift, workout("2026-11-09", 100, {})]).map(
        ({ saved }) => saved.circuitId
      )
    ).toEqual([base.id]);
  });

  it("reads two circuits on one day by when each was saved", () => {
    // The read orders by day only: the morning's circuit can come back
    // first. A Hard and unfinished one at 09:00, then an Easy one at 18:00:
    // the Easy one is the last word, and the circuit climbs a rung.
    const morning = workout("2026-11-10", 9 * 3600, {
      effort: "hard",
      finished: false,
      intervalsDone: 8,
      roundsDone: 1,
    });
    const evening = workout("2026-11-10", 18 * 3600, { effort: "easy" });
    const history = savedCircuits([morning, evening]);
    expect(history.map(({ saved }) => saved.effort)).toEqual(["easy", "hard"]);
    expect(circuitForToday(base, history).level).toBe(1);
  });

  it("keeps the day first, whatever the save times say", () => {
    const older = workout("2026-11-09", 20 * 3600, { effort: "easy" });
    const newer = workout("2026-11-10", 8 * 3600, { effort: "hard" });
    expect(
      savedCircuits([older, newer]).map(({ saved }) => saved.effort)
    ).toEqual(["hard", "easy"]);
  });
});

describe("a circuit chosen while the history could not be read", () => {
  it("is offered at its first rung, marked so", () => {
    const offered = circuitForToday(base, null);
    expect(offered).toEqual({ ...doseAt(base, 0), historyUnknown: true });
  });

  it("never sets the ladder back: Level 5, one slow read, then a Right", () => {
    // Rungs 0 to 4 are Levels 1 to 5, and the 10-minute circuit's top.
    const top = circuitTopLevel(base);
    expect(top).toBe(4);
    const atTop = workout(
      "2026-11-08",
      100,
      { effort: "right" },
      doseAt(base, top)
    );
    expect(circuitForToday(base, savedCircuits([atTop])).level).toBe(top);
    // The read hung: Level 1 was offered, done and called Right. Read as
    // the last word it would offer Level 1 again, four rungs lost.
    const blind = workout(
      "2026-11-10",
      200,
      { effort: "right" },
      circuitForToday(base, null)
    );
    const history = savedCircuits([atTop, blind]);
    expect(history[0].saved).toMatchObject({ level: 0, historyUnknown: true });
    const today = circuitForToday(base, history);
    expect(today.level).toBe(top);
    expect(today).toEqual(doseAt(base, top));
    expect(today.historyUnknown).toBeUndefined();
  });

  it("still climbs from the sessions around it", () => {
    const easy = workout(
      "2026-11-08",
      100,
      { effort: "easy" },
      doseAt(base, 1)
    );
    const blind = workout(
      "2026-11-09",
      200,
      { effort: "hard", finished: false },
      circuitForToday(base, null)
    );
    expect(circuitForToday(base, savedCircuits([easy, blind])).level).toBe(2);
  });

  it("still counts as a circuit done, so the next is not a first", () => {
    const blind = workout("2026-11-10", 200, {}, circuitForToday(base, null));
    expect(circuitReward(savedCircuits([blind]))).toBeNull();
  });
});

describe("circuitReward", () => {
  it("is a first circuit's only when there is none before it", () => {
    expect(circuitReward([])).toBe("first");
    expect(
      circuitReward(savedCircuits([workout("2026-11-09", 1, {})]))
    ).toBeNull();
  });
});
