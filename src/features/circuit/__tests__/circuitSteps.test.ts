import { describe, expect, it } from "vitest";
import { builtInCircuit } from "../builtInCircuits";
import {
  CIRCUIT_READY_SECONDS,
  circuitIntervals,
  circuitProgress,
  circuitSeconds,
  circuitSegments,
  circuitSteps,
  stepSecondsRan,
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

  it("plays the count in, work and rest as their own kinds, each for its seconds", () => {
    expect(segments.slice(0, 3).map((segment) => segment.type)).toEqual([
      "warmup",
      "hard",
      "recovery",
    ]);
    expect(segments.slice(0, 3).map((segment) => segment.label)).toEqual([
      "Get ready",
      tenMinute.moves[0].name,
      "Rest",
    ]);
    const steps = circuitSteps(tenMinute);
    expect(segments).toHaveLength(steps.length);
    segments.forEach((segment, index) => {
      expect(segment.target).toEqual({
        kind: "duration",
        seconds: steps[index].seconds,
      });
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

describe("circuitProgress: only work actually run counts", () => {
  const steps = circuitSteps(tenMinute);
  const full = steps.map((step) => step.seconds);
  const workIndices = steps
    .map((step, i) => (step.kind === "work" ? i : -1))
    .filter((i) => i >= 0);

  it("is nothing before any work ran", () => {
    expect(circuitProgress(tenMinute, steps, [])).toEqual({
      intervalsDone: 0,
      roundsDone: 0,
      workSecondsDone: 0,
      complete: false,
    });
  });

  it("is complete when every interval ran in full", () => {
    expect(circuitProgress(tenMinute, steps, full)).toEqual({
      intervalsDone: 10,
      roundsDone: 2,
      workSecondsDone: 400,
      complete: true,
    });
  });

  it("is not complete when the end was reached by skipping", () => {
    // Every step passed, none of it run: skipped to the end.
    const skipped = steps.map(() => 0);
    expect(circuitProgress(tenMinute, steps, skipped)).toEqual({
      intervalsDone: 0,
      roundsDone: 0,
      workSecondsDone: 0,
      complete: false,
    });
    // One interval cut short: its seconds count, it is not done, and
    // neither is its round or the circuit.
    const cut = [...full];
    cut[workIndices[7]] = 25;
    expect(circuitProgress(tenMinute, steps, cut)).toEqual({
      intervalsDone: 9,
      roundsDone: 1,
      workSecondsDone: 385,
      complete: false,
    });
  });

  it("counts a round once each of its moves ran in full", () => {
    const firstRound = full.map((seconds, i) =>
      i <= workIndices[4] ? seconds : 0
    );
    expect(circuitProgress(tenMinute, steps, firstRound)).toMatchObject({
      intervalsDone: 5,
      roundsDone: 1,
      complete: false,
    });
  });

  it("holds a step's seconds to its length", () => {
    const over = full.map((seconds) => seconds + 30);
    expect(circuitProgress(tenMinute, steps, over).workSecondsDone).toBe(400);
  });
});

describe("stepSecondsRan: what the player's step starts say was run", () => {
  it("measures each step from its start to the next, and the live one to now", () => {
    const starts = [{ elapsed: 0 }, { elapsed: 10 }, { elapsed: 50 }];
    expect(stepSecondsRan(starts, 4, 62)).toEqual([10, 40, 12, 0]);
  });

  it("gives a skipped step only the time before the skip", () => {
    // Skipped 12 s into the first work interval.
    const starts = [{ elapsed: 0 }, { elapsed: 10 }, { elapsed: 22 }];
    expect(stepSecondsRan(starts, 3, 30)).toEqual([10, 12, 8]);
  });
});
