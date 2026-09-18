import { describe, expect, it } from "vitest";
import type { SessionSegment } from "../runSegments";
import {
  idleSessionExecution,
  startSessionExecution,
  stepSessionExecution,
  sessionExecutionResults,
} from "../sessionExecution";

const segments: SessionSegment[] = [
  { type: "warmup", label: "Warm-up", instruction: "", target: { kind: "duration", seconds: 300 } },
  { type: "hard", label: "Rep 1", instruction: "", rep: 1, totalReps: 2, paceTarget: 300, target: { kind: "distance", meters: 1000 } },
  { type: "recovery", label: "Recover", instruction: "", target: { kind: "duration", seconds: 90 } },
  { type: "hard", label: "Rep 2", instruction: "", rep: 2, totalReps: 2, paceTarget: 300, target: { kind: "distance", meters: 1000 } },
  { type: "cooldown", label: "Cool-down", instruction: "", target: { kind: "duration", seconds: 300 } },
];
const start = () => startSessionExecution(idleSessionExecution(), segments);

describe("immutable session execution", () => {
  it("starts only once, including batched duplicate starts", () => {
    const state = start();
    expect(startSessionExecution(state, segments)).toBe(state);
    const progressed = stepSessionExecution(state, 300, 500);
    expect(startSessionExecution(progressed, segments)).toBe(progressed);
  });

  it("identical ticks return the same object and cannot feed a render loop", () => {
    const state = stepSessionExecution(start(), 100, 200);
    for (let i = 0; i < 100; i++) {
      expect(stepSessionExecution(state, 100, 200)).toBe(state);
    }
    const advanced = stepSessionExecution(state, 300, 500);
    expect(stepSessionExecution(advanced, 300, 500)).toBe(advanced);
  });

  it("replaying an updater produces the same nonzero segment measurements", () => {
    const previous = start();
    Object.freeze(previous.finished);
    Object.freeze(previous);
    const first = stepSessionExecution(previous, 301, 500);
    const replay = stepSessionExecution(previous, 301, 500);
    expect(replay).toEqual(first);
    expect(first.finished[0]).toMatchObject({ elapsedSeconds: 301, distanceMeters: 500 });
    expect(previous.index).toBe(0);
    expect(previous.finished).toEqual([]);
  });

  it("records a skipped rep's measured portion, not a completed target", () => {
    let state = stepSessionExecution(start(), 300, 500);
    state = stepSessionExecution(state, 330, 650, "skip");
    expect(state.finished[1]).toMatchObject({
      rep: 1, outcome: "skipped", elapsedSeconds: 30, distanceMeters: 150,
      paceTarget: 300, captureVersion: 2, measurementsReliable: true,
    });
    expect(state.finished.some((row) => row.index > 1)).toBe(false);
  });

  it("retains one active partial record without modifying terminal records", () => {
    let state = stepSessionExecution(start(), 300, 500);
    const warmup = state.finished[0];
    state = stepSessionExecution(state, 330, 650);
    expect(sessionExecutionResults(state)).toHaveLength(2);
    expect(sessionExecutionResults(state)[1]).toMatchObject({
      index: 1, outcome: "in_progress", elapsedSeconds: 30, distanceMeters: 150,
    });
    state = stepSessionExecution(state, 360, 800);
    expect(sessionExecutionResults(state)).toHaveLength(2);
    expect(sessionExecutionResults(state)[1].distanceMeters).toBe(300);
    expect(state.finished[0]).toBe(warmup);
    expect(state.finished).toHaveLength(1);
  });

  it("distance reps cannot complete from time alone", () => {
    const state = stepSessionExecution(start(), 300, 500);
    const muchLater = stepSessionExecution(state, 1500, 700);
    expect(muchLater.index).toBe(1);
    expect(sessionExecutionResults(muchLater)[1].outcome).toBe("in_progress");
  });

  it("pause/resume with unchanged counters neither burns nor duplicates work", () => {
    const state = stepSessionExecution(start(), 120, 200);
    expect(stepSessionExecution(state, 120, 200)).toBe(state);
    expect(stepSessionExecution(state, 300, 500).finished[0].elapsedSeconds).toBe(300);
  });

  it("copies targets and paces at launch rather than reading later settings", () => {
    const supplied = structuredClone(segments);
    let state = startSessionExecution(idleSessionExecution(), supplied);
    supplied[1].paceTarget = 180;
    supplied[1].target = { kind: "distance", meters: 400 };
    state = stepSessionExecution(state, 300, 500);
    state = stepSessionExecution(state, 600, 1500);
    expect(state.finished[1]).toMatchObject({
      paceTarget: 300, target: { kind: "distance", meters: 1000 },
    });
  });

  it.each([[NaN, 10], [Infinity, 10], [-1, 10], [100, NaN], [100, Infinity], [100, -1]])(
    "rejects invalid counters %s / %s without corrupting evidence",
    (elapsed, distance) => {
      const previous = stepSessionExecution(start(), 50, 100);
      const state = stepSessionExecution(previous, elapsed, distance);
      expect(state.index).toBe(previous.index);
      expect(state.lastElapsed).toBe(50);
      expect(state.lastDistance).toBe(100);
      expect(state.measurementsReliable).toBe(false);
      expect(sessionExecutionResults(state).every((row) => row.measurementsReliable === false)).toBe(true);
    }
  );

  it("counter regressions stay uncertain even after later valid samples", () => {
    let state = stepSessionExecution(start(), 300, 500);
    state = stepSessionExecution(state, 299, 500);
    state = stepSessionExecution(state, 600, 1500);
    expect(state.finished[1].elapsedSeconds).toBe(300);
    expect(sessionExecutionResults(state).every((row) => row.measurementsReliable === false)).toBe(true);
  });

  it("skips degenerate future steps without inventing records for them", () => {
    const state = startSessionExecution(idleSessionExecution(), [
      segments[0],
      { ...segments[2], target: { kind: "duration", seconds: 0 } },
      segments[1],
    ]);
    const next = stepSessionExecution(state, 300, 500);
    expect(next.index).toBe(2);
    expect(next.finished).toHaveLength(1);
  });

  it("completion is terminal and empty sessions remain inert", () => {
    const idle = idleSessionExecution();
    expect(startSessionExecution(idle, [])).toBe(idle);
    expect(stepSessionExecution(idle, 10, 10)).toBe(idle);
    let state = start();
    for (let i = 0; i < segments.length; i++) state = stepSessionExecution(state, 0, 0, "skip");
    expect(state.index).toBe(segments.length);
    expect(stepSessionExecution(state, 10000, 20000)).toBe(state);
    expect(sessionExecutionResults(state)).toHaveLength(segments.length);
  });
});
