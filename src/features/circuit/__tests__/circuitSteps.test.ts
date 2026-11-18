import { describe, expect, it } from "vitest";
import { builtInCircuit } from "../builtInCircuits";
import {
  CIRCUIT_READY_SECONDS,
  circuitIntervals,
  circuitProgress,
  circuitSeconds,
  circuitSegments,
  circuitSteps,
  stepEndsPassed,
} from "../circuitSteps";
import type { Circuit } from "../circuitTypes";

const tenMinute = builtInCircuit({ kit: "minimal", minutes: 10 });

describe("circuitSteps (Circ1 (10))", () => {
  it("counts in, then works and rests, with no rest after the last interval", () => {
    const steps = circuitSteps(tenMinute);
    expect(steps[0]).toMatchObject({
      kind: "ready",
      seconds: CIRCUIT_READY_SECONDS,
      move: tenMinute.moves[0],
      interval: 0,
    });
    expect(CIRCUIT_READY_SECONDS).toBe(10);
    const work = steps.filter((step) => step.kind === "work");
    const rest = steps.filter((step) => step.kind === "rest");
    expect(work).toHaveLength(circuitIntervals(tenMinute));
    expect(work).toHaveLength(10);
    expect(rest).toHaveLength(9);
    expect(steps[steps.length - 1].kind).toBe("work");
  });

  it("sums to the clock, plus the count in", () => {
    for (const minutes of [10, 20, 30] as const)
      for (const lowImpact of [false, true]) {
        const circuit = builtInCircuit({ kit: "home_gym", minutes, lowImpact });
        const steps = circuitSteps(circuit);
        const total = steps.reduce((sum, step) => sum + step.seconds, 0);
        expect(total).toBe(circuitSeconds(circuit) + CIRCUIT_READY_SECONDS);
      }
  });

  it("walks the moves in order, round after round, and names the next move in a rest", () => {
    const steps = circuitSteps(tenMinute);
    const work = steps.filter((step) => step.kind === "work");
    expect(work.map((step) => step.move.exerciseId)).toEqual([
      ...tenMinute.moves.map((move) => move.exerciseId),
      ...tenMinute.moves.map((move) => move.exerciseId),
    ]);
    expect(work.map((step) => step.round)).toEqual([
      1, 1, 1, 1, 1, 2, 2, 2, 2, 2,
    ]);
    const firstRest = steps.find((step) => step.kind === "rest")!;
    expect(firstRest.move).toEqual(tenMinute.moves[1]);
    // The rest between rounds names the round's first move.
    const roundTurn = steps[steps.indexOf(work[4]) + 1];
    expect(roundTurn.kind).toBe("rest");
    expect(roundTurn.move).toEqual(tenMinute.moves[0]);
  });

  it("makes no steps for an empty circuit", () => {
    const empty: Circuit = { ...tenMinute, moves: [] };
    expect(circuitSteps(empty)).toEqual([]);
    expect(circuitSeconds(empty)).toBe(0);
    expect(circuitSteps({ ...tenMinute, rounds: 0 })).toEqual([]);
  });
});

describe("circuitSegments: what the session player plays", () => {
  const segments = circuitSegments(tenMinute);

  it("plays work as hard and a rest as recovery, each for its seconds", () => {
    const steps = circuitSteps(tenMinute);
    expect(segments).toHaveLength(steps.length);
    segments.forEach((segment, index) => {
      const step = steps[index];
      expect(segment.target).toEqual({
        kind: "duration",
        seconds: step.seconds,
      });
      expect(segment.type).toBe(
        step.kind === "work"
          ? "hard"
          : step.kind === "rest"
            ? "recovery"
            : "warmup"
      );
    });
  });

  it("numbers the work intervals and cues the last one", () => {
    const work = segments.filter((segment) => segment.type === "hard");
    expect(work.map((segment) => segment.rep)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(work.every((segment) => segment.totalReps === 10)).toBe(true);
    expect(work[0].cue).toBe(`${tenMinute.moves[0].name}. Go.`);
    expect(work[9].cue).toBe(`Last one. ${tenMinute.moves[4].name}. Go.`);
    expect(segments[0].cue).toBe(
      `First up, ${tenMinute.moves[0].name}. Get ready.`
    );
  });
});

describe("circuitProgress", () => {
  const steps = circuitSteps(tenMinute);

  it("is nothing during the count in", () => {
    expect(circuitProgress(tenMinute, steps, 0, 5)).toEqual({
      intervalsDone: 0,
      roundsDone: 0,
      workSecondsDone: 0,
      complete: false,
    });
    expect(circuitProgress(tenMinute, steps, -1, 0).intervalsDone).toBe(0);
  });

  it("counts the live interval's seconds, held to its length", () => {
    expect(circuitProgress(tenMinute, steps, 1, 12.7).workSecondsDone).toBe(12);
    expect(circuitProgress(tenMinute, steps, 1, 99).workSecondsDone).toBe(40);
  });

  it("counts an interval once its rest begins", () => {
    expect(circuitProgress(tenMinute, steps, 2, 0)).toMatchObject({
      intervalsDone: 1,
      roundsDone: 0,
      workSecondsDone: 40,
    });
  });

  it("counts a round once its last move is done", () => {
    // Steps: ready, then work/rest pairs; the fifth work is index 9.
    expect(circuitProgress(tenMinute, steps, 9, 39).roundsDone).toBe(0);
    expect(circuitProgress(tenMinute, steps, 10, 0).roundsDone).toBe(1);
  });

  it("is complete only past the last step", () => {
    const last = steps.length - 1;
    expect(circuitProgress(tenMinute, steps, last, 39).complete).toBe(false);
    expect(circuitProgress(tenMinute, steps, steps.length, 0)).toEqual({
      intervalsDone: 10,
      roundsDone: 2,
      workSecondsDone: 400,
      complete: true,
    });
  });
});

describe("stepEndsPassed: steps end on the clock", () => {
  const seconds = [10, 40, 20, 40];

  it("ends nothing while the live step runs", () => {
    expect(stepEndsPassed(seconds, 0, 0, 9)).toEqual([]);
    expect(stepEndsPassed(seconds, 1, 10, 49)).toEqual([]);
  });

  it("ends a step at its own end, not the tick that noticed", () => {
    expect(stepEndsPassed(seconds, 0, 0, 10)).toEqual([10]);
    expect(stepEndsPassed(seconds, 0, 0, 11)).toEqual([10]);
  });

  it("ends every step a jump of the clock passed over", () => {
    // The screen slept from 5 s to 75 s: the count in, the first work
    // and the rest after it all ended while it was dark.
    expect(stepEndsPassed(seconds, 0, 0, 75)).toEqual([10, 50, 70]);
    expect(stepEndsPassed(seconds, 0, 0, 500)).toEqual([10, 50, 70, 110]);
  });

  it("starts from the live step's own start", () => {
    // Skipped into the rest at 30 s: it ends 20 s later, at 50 s.
    expect(stepEndsPassed(seconds, 2, 30, 49)).toEqual([]);
    expect(stepEndsPassed(seconds, 2, 30, 50)).toEqual([50]);
  });

  it("ends nothing before the player starts or once it is complete", () => {
    expect(stepEndsPassed(seconds, -1, 0, 100)).toEqual([]);
    expect(stepEndsPassed(seconds, 4, 110, 200)).toEqual([]);
  });
});
