import { describe, expect, it } from "vitest";
import type { SessionSegment } from "../runSegments";
import {
  evaluateIntervalExecution,
  intervalExecutionSummary,
  type IntervalExecutionInput,
} from "../intervalExecution";
import {
  idleSessionExecution,
  startSessionExecution,
  stepSessionExecution,
  sessionExecutionResults,
} from "../sessionExecution";

function fixture(): IntervalExecutionInput {
  const segments: SessionSegment[] = [
    { type: "warmup", label: "Warm-up", instruction: "", target: { kind: "duration", seconds: 300 } },
  ];
  for (let rep = 1; rep <= 4; rep++) {
    segments.push({ type: "hard", label: `Rep ${rep}`, instruction: "", rep, totalReps: 4, paceTarget: 300, target: { kind: "distance", meters: 1000 } });
    if (rep < 4) segments.push({ type: "recovery", label: "Recover", instruction: "", target: { kind: "duration", seconds: 90 } });
  }
  segments.push({ type: "cooldown", label: "Cool-down", instruction: "", target: { kind: "duration", seconds: 300 } });
  let state = startSessionExecution(idleSessionExecution(), segments);
  state = stepSessionExecution(state, 300, 500);
  state = stepSessionExecution(state, 600, 1500); // complete rep 1 at 5:00/km
  state = stepSessionExecution(state, 690, 1650);
  state = stepSessionExecution(state, 750, 1850, "skip"); // partial rep 2 skipped
  state = stepSessionExecution(state, 840, 2000);
  state = stepSessionExecution(state, 930, 2300); // rep 3 still active
  return {
    segments, segmentResults: sessionExecutionResults(state), activityType: "intervals",
    recordingContinuity: "confirmed", routeConfidence: "good", durationSeconds: 930,
    distanceMeters: 2300,
  };
}

describe("descriptive interval execution comparison", () => {
  it("separates completed, skipped, partial and unrecorded reps", () => {
    const evaluation = evaluateIntervalExecution(fixture());
    expect(evaluation).toMatchObject({
      status: "available", plannedReps: 4, completedReps: 1, skippedReps: 1,
      partialReps: 1, unrecordedReps: 1, paceComparisonsAvailable: 1,
    });
    expect(intervalExecutionSummary(evaluation)).toBe(
      "1 of 4 reps recorded as completed · 1 skipped · 1 partially recorded · 1 unrecorded."
    );
    if (evaluation.status !== "available") throw new Error("Expected evidence");
    expect(evaluation.reps[0]).toMatchObject({ achievedPaceSPerKm: 300, savedTargetPaceSPerKm: 300, paceDifferenceSPerKm: 0 });
    expect(evaluation.reps[1]).toMatchObject({ outcome: "skipped", distanceMeters: 200, achievedPaceSPerKm: null });
    expect(evaluation.reps[2]).toMatchObject({ outcome: "in_progress", distanceMeters: 300, achievedPaceSPerKm: null });
    expect(evaluation.reps[3]).toMatchObject({ outcome: "unrecorded", distanceMeters: null });
  });

  it.each(["poor", "patchy", null] as const)("withholds pace comparisons for %s GPS", (confidence) => {
    const evaluation = evaluateIntervalExecution({ ...fixture(), routeConfidence: confidence });
    expect(evaluation).toMatchObject({ status: "available", completedReps: 1, paceComparisonsAvailable: 0 });
    if (evaluation.status !== "available") throw new Error("Expected counts");
    expect(evaluation.reps.every((rep) => rep.achievedPaceSPerKm === null)).toBe(true);
  });

  it("withholds resumed/missing-checkpoint feedback rather than assuming continuity", () => {
    expect(evaluateIntervalExecution({ ...fixture(), recordingContinuity: "unknown" })).toEqual({
      status: "unavailable", reason: "continuity_unknown",
    });
  });

  it.each(["manual", "treadmill", "freerun", "tempo"])("does not classify %s as interval evidence", (activityType) => {
    expect(evaluateIntervalExecution({ ...fixture(), activityType }).status).toBe("unavailable");
  });

  it.each([{ isInvalid: true }, { savedAnyway: true }, { durationSeconds: 0 }, { distanceMeters: NaN }])(
    "withholds invalid run evidence %j", (patch) => {
      expect(evaluateIntervalExecution({ ...fixture(), ...patch }).status).toBe("unavailable");
    }
  );

  it.each([null, [], undefined])("treats missing/empty evidence as unknown: %s", (segmentResults) => {
    const evaluation = evaluateIntervalExecution({ ...fixture(), segmentResults });
    expect(evaluation).toMatchObject({ status: "unavailable", reason: "missing_evidence" });
    expect(intervalExecutionSummary(evaluation)).toBeNull();
  });

  it("does not accept legacy records without the reliable-capture version", () => {
    const input = fixture();
    const rows = structuredClone(input.segmentResults) as Array<Record<string, unknown>>;
    delete rows[0].captureVersion;
    expect(evaluateIntervalExecution({ ...input, segmentResults: rows }).status).toBe("unavailable");
  });

  it.each([
    { outcome: "completed", distanceMeters: 100 },
    { elapsedSeconds: NaN },
    { distanceMeters: -1 },
    { measurementsReliable: false },
    { index: 0 },
    { rep: 9 },
    { target: { kind: "distance", meters: 2000 } },
    { paceTarget: 200 },
  ])("rejects ambiguous/corrupt work rows %j", (patch) => {
    const input = fixture();
    const rows = structuredClone(input.segmentResults) as Array<Record<string, unknown>>;
    Object.assign(rows[1], patch);
    expect(evaluateIntervalExecution({ ...input, segmentResults: rows }).status).toBe("unavailable");
  });

  it("rejects missing intervening records and duplicate rows", () => {
    const input = fixture();
    const rows = input.segmentResults as unknown[];
    for (const changed of [[...rows.slice(0, 2), ...rows.slice(3)], [rows[0], ...rows]]) {
      expect(evaluateIntervalExecution({ ...input, segmentResults: changed }).status).toBe("unavailable");
    }
  });

  it("rejects a non-terminal partial record", () => {
    const input = fixture();
    const rows = structuredClone(input.segmentResults) as Array<Record<string, unknown>>;
    rows[1].outcome = "in_progress";
    expect(evaluateIntervalExecution({ ...input, segmentResults: rows }).status).toBe("unavailable");
  });

  it("checks segment totals against the saved run rather than overcounting", () => {
    expect(evaluateIntervalExecution({ ...fixture(), durationSeconds: 900 }).status).toBe("unavailable");
    expect(evaluateIntervalExecution({ ...fixture(), distanceMeters: 2200 }).status).toBe("unavailable");
  });

  it("reports a factual target difference without inventing a target window", () => {
    const input = fixture();
    const rows = structuredClone(input.segmentResults) as Array<Record<string, unknown>>;
    rows[1].elapsedSeconds = 310;
    const evaluation = evaluateIntervalExecution({ ...input, segmentResults: rows, durationSeconds: 940 });
    if (evaluation.status !== "available") throw new Error("Expected evidence");
    expect(evaluation.reps[0].paceDifferenceSPerKm).toBe(10);
    expect(evaluation).not.toHaveProperty("suggestedPace");
    expect(evaluation).not.toHaveProperty("fitnessScore");
  });

  it("is deterministic and does not modify its inputs", () => {
    const input = fixture();
    const copy = structuredClone(input);
    expect(evaluateIntervalExecution(input)).toEqual(evaluateIntervalExecution(input));
    expect(input).toEqual(copy);
  });
});
