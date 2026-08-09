import { useState, useCallback, useEffect, useRef } from "react";
import type { SessionSegment } from "@/lib/runSegments";

/**
 * useSessionPlayer — the ONE in-run structure walker (STRUCT-SESS-02).
 *
 * Replaces `useIntervalWorkout`'s six-state machine, whose
 * `[warmup?] → (work,rest)×N → [cooldown?]` shape was hardcoded in three
 * mirrored switches (start/tick/skip) that the code itself flagged as
 * fragile. The session's shape now lives in DATA — the canonical
 * `SessionSegment[]` from runSegments.ts — and this hook only advances an
 * index, so tempo blocks, floats, strides and any future structure are
 * additions of data, not of control flow.
 *
 * Contract carried over unchanged from the old hook:
 *  - `start()` is IDEMPOTENT from anywhere but idle — the Run page's start
 *    effect re-fires on every render of an active run, and pre-guard each
 *    re-fire silently reset a live workout to its first step.
 *  - the hook is PUSHED ticks (`tick(elapsed, totalDistance)`) from the
 *    page's timer/GPS loop; it owns only the per-segment clock/odometer.
 *    Pause-correctness rides the caller's loop exactly as before.
 *  - `skip(totalDistance)` forces the advance `tick` would take — one
 *    shared advance path now, nothing to keep mirrored.
 *  - distance-based segments complete on metres covered; duration-based on
 *    seconds elapsed. A non-positive target advances immediately (bounded
 *    walk), so a degenerate zero-length segment can never wedge a run.
 */

export interface SessionPlayerState {
  /** −1 idle; `segments.length` complete; else the live segment index. */
  index: number;
  phaseElapsed: number;
  phaseDistanceCovered: number;
}

export interface SessionPlayer {
  state: SessionPlayerState;
  segments: SessionSegment[];
  current: SessionSegment | null;
  next: SessionSegment | null;
  isComplete: boolean;
  start: () => void;
  tick: (totalElapsed: number, totalDistance: number) => void;
  skip: (totalDistance: number) => void;
}

const IDLE: SessionPlayerState = {
  index: -1,
  phaseElapsed: 0,
  phaseDistanceCovered: 0,
};

function targetMet(seg: SessionSegment, elapsed: number, dist: number): boolean {
  if (seg.target.kind === "distance") {
    return seg.target.meters <= 0 || dist >= seg.target.meters;
  }
  return seg.target.seconds <= 0 || elapsed >= seg.target.seconds;
}

export function useSessionPlayer(
  segments: SessionSegment[] | null | undefined
): SessionPlayer {
  const segs = segments ?? [];
  const [state, setState] = useState<SessionPlayerState>(IDLE);

  const phaseStartTime = useRef(0);
  const phaseStartDistance = useRef(0);
  // Live-index mirror so start() stays idempotent without joining the
  // state into its deps (same pattern the old hook documented).
  const indexRef = useRef(-1);
  useEffect(() => {
    indexRef.current = state.index;
  }, [state.index]);

  const start = useCallback(() => {
    if (segs.length === 0) return;
    if (indexRef.current !== -1) return;
    phaseStartTime.current = Date.now();
    phaseStartDistance.current = 0;
    setState({ index: 0, phaseElapsed: 0, phaseDistanceCovered: 0 });
  }, [segs.length]);

  const advance = useCallback(
    (prev: SessionPlayerState, totalDistance: number): SessionPlayerState => {
      let index = prev.index + 1;
      phaseStartTime.current = Date.now();
      phaseStartDistance.current = totalDistance;
      // Bounded walk past degenerate zero-target segments.
      while (index < segs.length && targetMet(segs[index], 0, 0)) {
        index += 1;
      }
      return { index, phaseElapsed: 0, phaseDistanceCovered: 0 };
    },
    [segs]
  );

  const tick = useCallback(
    (_totalElapsed: number, totalDistance: number) => {
      if (segs.length === 0) return;
      setState((prev) => {
        if (prev.index < 0 || prev.index >= segs.length) return prev;
        const phaseElapsed = (Date.now() - phaseStartTime.current) / 1000;
        const phaseDistanceCovered =
          totalDistance - phaseStartDistance.current;
        const seg = segs[prev.index];
        if (targetMet(seg, phaseElapsed, phaseDistanceCovered)) {
          return advance(prev, totalDistance);
        }
        return { ...prev, phaseElapsed, phaseDistanceCovered };
      });
    },
    [segs, advance]
  );

  const skip = useCallback(
    (totalDistance: number) => {
      if (segs.length === 0) return;
      setState((prev) => {
        if (prev.index < 0 || prev.index >= segs.length) return prev;
        return advance(prev, totalDistance);
      });
    },
    [segs, advance]
  );

  const current =
    state.index >= 0 && state.index < segs.length ? segs[state.index] : null;
  const next =
    state.index >= 0 && state.index + 1 < segs.length
      ? segs[state.index + 1]
      : null;

  return {
    state,
    segments: segs,
    current,
    next,
    isComplete: segs.length > 0 && state.index >= segs.length,
    start,
    tick,
    skip,
  };
}
