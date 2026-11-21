import { describe, expect, it } from "vitest";
import { builtInCircuit } from "../builtInCircuits";
import {
  CIRCUIT_SESSION_START,
  circuitClockRuns,
  stepCircuitSession,
  type CircuitSessionEvent,
  type CircuitSessionState,
} from "../circuitSession";

const circuit = builtInCircuit({ kit: "minimal", minutes: 10 });

function walk(...events: CircuitSessionEvent[]): CircuitSessionState {
  return events.reduce(stepCircuitSession, CIRCUIT_SESSION_START);
}

describe("the circuit page's states (Circ1 (10), (11), (A))", () => {
  it("picks, runs, pauses and resumes", () => {
    expect(walk().phase).toBe("picking");
    expect(walk({ type: "choose", circuit }).phase).toBe("running");
    expect(walk({ type: "choose", circuit }, { type: "pause" }).phase).toBe(
      "paused"
    );
    expect(
      walk({ type: "choose", circuit }, { type: "pause" }, { type: "resume" })
        .phase
    ).toBe("running");
  });

  it("asks before it ends, and keeps going on the clock", () => {
    const asked = walk({ type: "choose", circuit }, { type: "askEnd" });
    expect(asked.phase).toBe("ending");
    expect(stepCircuitSession(asked, { type: "keepGoing" }).phase).toBe(
      "running"
    );
    expect(stepCircuitSession(asked, { type: "discard" }).phase).toBe(
      "discarded"
    );
    const ended = stepCircuitSession(asked, { type: "end" });
    expect(ended).toMatchObject({ phase: "finish", finished: false });
  });

  it("never ends or discards without the question", () => {
    const running = walk({ type: "choose", circuit });
    expect(stepCircuitSession(running, { type: "end" })).toBe(running);
    expect(stepCircuitSession(running, { type: "discard" })).toBe(running);
  });

  it("finishes when every interval is done", () => {
    expect(
      walk({ type: "choose", circuit }, { type: "complete" })
    ).toMatchObject({ phase: "finish", finished: true });
  });

  it("rates, saves once, and comes back to the finish on a failed save", () => {
    const finish = walk(
      { type: "choose", circuit },
      { type: "complete" },
      { type: "rate", effort: "right" }
    );
    expect(finish.effort).toBe("right");
    const saving = stepCircuitSession(finish, { type: "save" });
    expect(saving.phase).toBe("saving");
    // A second tap while saving does nothing.
    expect(stepCircuitSession(saving, { type: "save" })).toBe(saving);
    expect(stepCircuitSession(saving, { type: "rate", effort: "easy" })).toBe(
      saving
    );
    const failed = stepCircuitSession(saving, {
      type: "failed",
      error: "Couldn’t save. Try again.",
    });
    expect(failed).toMatchObject({
      phase: "finish",
      error: "Couldn’t save. Try again.",
      effort: "right",
    });
    expect(
      stepCircuitSession(stepCircuitSession(failed, { type: "save" }), {
        type: "saved",
        workoutId: "free-c1",
      })
    ).toMatchObject({ phase: "saved", workoutId: "free-c1", error: undefined });
  });

  it("lets a finish under 7 minutes close without saving", () => {
    const finish = walk({ type: "choose", circuit }, { type: "complete" });
    expect(stepCircuitSession(finish, { type: "discard" }).phase).toBe(
      "discarded"
    );
  });

  it("asks before a finish is dropped, and keeps it on Keep", () => {
    const finish = walk(
      { type: "choose", circuit },
      { type: "complete" },
      { type: "rate", effort: "hard" }
    );
    const asked = stepCircuitSession(finish, { type: "askDiscard" });
    expect(asked.phase).toBe("discarding");
    // Nothing is rated or saved behind the question.
    expect(stepCircuitSession(asked, { type: "save" })).toBe(asked);
    expect(stepCircuitSession(asked, { type: "rate", effort: "easy" })).toBe(
      asked
    );
    expect(stepCircuitSession(asked, { type: "keep" })).toMatchObject({
      phase: "finish",
      effort: "hard",
    });
    expect(stepCircuitSession(asked, { type: "discard" }).phase).toBe(
      "discarded"
    );
  });

  it("never asks to discard a circuit being saved or saved", () => {
    const saving = walk(
      { type: "choose", circuit },
      { type: "complete" },
      { type: "save" }
    );
    expect(stepCircuitSession(saving, { type: "askDiscard" })).toBe(saving);
    expect(stepCircuitSession(saving, { type: "discard" })).toBe(saving);
    const running = walk({ type: "choose", circuit });
    expect(stepCircuitSession(running, { type: "askDiscard" })).toBe(running);
    expect(stepCircuitSession(running, { type: "keep" })).toBe(running);
  });

  it("runs the clock only while running", () => {
    expect(circuitClockRuns("running")).toBe(true);
    for (const phase of [
      "picking",
      "paused",
      "ending",
      "finish",
      "discarding",
      "saving",
      "saved",
      "discarded",
    ] as const)
      expect(circuitClockRuns(phase)).toBe(false);
  });
});
