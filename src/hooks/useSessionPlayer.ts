import { useState, useCallback, useMemo } from "react";
import type { SessionSegment } from "@/lib/runSegments";
import {
  idleSessionExecution,
  startSessionExecution,
  stepSessionExecution,
  sessionExecutionResults,
  type SessionSegmentResult,
} from "@/lib/sessionExecution";

// Keep the existing type import path compatible with RunSummary.
export type { SessionSegmentResult } from "@/lib/sessionExecution";

export interface SessionPlayerState {
  /** -1 idle; segments.length complete; otherwise the live segment index. */
  index: number;
  phaseElapsed: number;
  phaseDistanceCovered: number;
  /** Terminal records plus, when observed, one explicitly partial record. */
  results: SessionSegmentResult[];
}

export interface SessionPlayer {
  state: SessionPlayerState;
  segments: SessionSegment[];
  current: SessionSegment | null;
  next: SessionSegment | null;
  isComplete: boolean;
  start: () => void;
  tick: (totalElapsed: number, totalDistance: number) => void;
  skip: (totalElapsed: number, totalDistance: number) => void;
}

/** One structure walker. All clock/odometer anchors live in the same immutable
 * state as the segment index and evidence, not mutable refs inside React state
 * updaters. Identical ticks return the same state so the Run page's effect
 * cannot form a render -> tick -> new object -> render feedback loop. */
export function useSessionPlayer(
  segments: SessionSegment[] | null | undefined
): SessionPlayer {
  const supplied = useMemo(() => segments ?? [], [segments]);
  const [execution, setExecution] = useState(idleSessionExecution);
  const start = useCallback(() => {
    setExecution((previous) => startSessionExecution(previous, supplied));
  }, [supplied]);
  const tick = useCallback((elapsed: number, distance: number) => {
    setExecution((previous) => stepSessionExecution(previous, elapsed, distance));
  }, []);
  const skip = useCallback((elapsed: number, distance: number) => {
    setExecution((previous) =>
      stepSessionExecution(previous, elapsed, distance, "skip")
    );
  }, []);

  return useMemo(() => {
    const segs = execution.index < 0 ? supplied : execution.segments;
    const index = execution.index;
    return {
      state: {
        index,
        phaseElapsed: execution.phaseElapsed,
        phaseDistanceCovered: execution.phaseDistanceCovered,
        results: sessionExecutionResults(execution),
      },
      segments: segs,
      current: index >= 0 && index < segs.length ? segs[index] : null,
      next: index >= 0 && index + 1 < segs.length ? segs[index + 1] : null,
      isComplete: segs.length > 0 && index >= segs.length,
      start,
      tick,
      skip,
    };
  }, [execution, supplied, start, tick, skip]);
}
