import type { SessionSegment } from "./runSegments";

/** V2 distinguishes observed partial work from completed or skipped work.
 * Values are samples from the pause-corrected timer and accepted GPS distance,
 * not interpolated finish-line measurements. No fitness inference lives here. */
export interface SessionSegmentResult {
  index: number;
  type: SessionSegment["type"];
  rep?: number;
  totalReps?: number;
  target: SessionSegment["target"];
  outcome: "completed" | "skipped" | "in_progress";
  elapsedSeconds: number;
  distanceMeters: number;
  captureVersion?: 2;
  measurementsReliable?: boolean;
  /** Captured from the launched segment, never today's fitness settings. */
  paceTarget?: number;
}

export interface SessionExecution {
  index: number;
  phaseElapsed: number;
  phaseDistanceCovered: number;
  phaseStartElapsed: number;
  phaseStartDistance: number;
  lastElapsed: number;
  lastDistance: number;
  measurementsReliable: boolean;
  segments: SessionSegment[];
  finished: SessionSegmentResult[];
}

export function idleSessionExecution(): SessionExecution {
  return {
    index: -1,
    phaseElapsed: 0,
    phaseDistanceCovered: 0,
    phaseStartElapsed: 0,
    phaseStartDistance: 0,
    lastElapsed: 0,
    lastDistance: 0,
    measurementsReliable: true,
    segments: [],
    finished: [],
  };
}

/** Pure and idempotent even when React queues two start calls together. */
export function startSessionExecution(
  previous: SessionExecution,
  segments: SessionSegment[]
): SessionExecution {
  if (previous.index !== -1 || !segments.length) return previous;
  return {
    ...idleSessionExecution(),
    index: 0,
    // Freeze the launched prescription by value. A settings/unit rerender
    // must not retroactively change the targets used to judge recorded work.
    segments: segments.map((segment) => ({
      ...segment,
      target: { ...segment.target },
    })),
  };
}

function met(segment: SessionSegment, elapsed: number, distance: number) {
  return segment.target.kind === "distance"
    ? distance >= segment.target.meters
    : elapsed >= segment.target.seconds;
}

function resultFor(
  state: SessionExecution,
  outcome: SessionSegmentResult["outcome"]
): SessionSegmentResult {
  const segment = state.segments[state.index];
  return {
    index: state.index,
    type: segment.type,
    ...(segment.rep != null ? { rep: segment.rep } : {}),
    ...(segment.totalReps != null ? { totalReps: segment.totalReps } : {}),
    target: { ...segment.target },
    ...(Number.isFinite(segment.paceTarget) && segment.paceTarget! > 0
      ? { paceTarget: segment.paceTarget }
      : {}),
    outcome,
    elapsedSeconds: state.phaseElapsed,
    distanceMeters: state.phaseDistanceCovered,
    captureVersion: 2,
    measurementsReliable: state.measurementsReliable,
  };
}

/** No mutation, refs, wall clock or I/O. Replaying this transition against
 * the same input yields the same measurements, including in Strict Mode. */
export function stepSessionExecution(
  previous: SessionExecution,
  totalElapsed: number,
  totalDistance: number,
  action: "tick" | "skip" = "tick"
): SessionExecution {
  if (previous.index < 0 || previous.index >= previous.segments.length)
    return previous;
  if (
    !Number.isFinite(totalElapsed) ||
    !Number.isFinite(totalDistance) ||
    totalElapsed < previous.lastElapsed ||
    totalDistance < previous.lastDistance ||
    totalElapsed < 0 ||
    totalDistance < 0
  ) {
    // Bad samples cannot create negative/NaN evidence or advance a rep.
    // Retain a sticky uncertainty flag rather than silently hiding the fault.
    return previous.measurementsReliable
      ? { ...previous, measurementsReliable: false }
      : previous;
  }
  const segment = previous.segments[previous.index];
  const elapsed = totalElapsed - previous.phaseStartElapsed;
  const distance = totalDistance - previous.phaseStartDistance;
  const completed = met(segment, elapsed, distance);
  if (
    action === "tick" &&
    !completed &&
    totalElapsed === previous.lastElapsed &&
    totalDistance === previous.lastDistance
  )
    return previous;

  const sampled: SessionExecution = {
    ...previous,
    lastElapsed: totalElapsed,
    lastDistance: totalDistance,
    phaseElapsed: elapsed,
    phaseDistanceCovered: distance,
  };
  if (action === "tick" && !completed) return sampled;

  let index = previous.index + 1;
  // Preserve the player's existing bounded walk over zero-length segments;
  // no execution record is invented for a segment the runner never occupied.
  while (index < previous.segments.length && met(previous.segments[index], 0, 0))
    index += 1;
  return {
    ...sampled,
    index,
    phaseElapsed: 0,
    phaseDistanceCovered: 0,
    phaseStartElapsed: totalElapsed,
    phaseStartDistance: totalDistance,
    finished: [
      ...previous.finished,
      resultFor(sampled, action === "skip" ? "skipped" : "completed"),
    ],
  };
}

/** A save of the current player state retains the active partial segment.
 * It remains explicitly in_progress: saving must never manufacture completion
 * or claim that a missing final tick was observed. Terminal rows stay fixed. */
export function sessionExecutionResults(
  state: SessionExecution
): SessionSegmentResult[] {
  const active = state.index >= 0 && state.index < state.segments.length;
  const results = active && (state.phaseElapsed > 0 || state.phaseDistanceCovered > 0)
    ? [...state.finished, resultFor(state, "in_progress")]
    : state.finished;
  return state.measurementsReliable
    ? results
    : results.map((row) => ({ ...row, measurementsReliable: false }));
}
