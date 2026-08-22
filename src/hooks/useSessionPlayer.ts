import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
 *  - the hook is PUSHED ticks (`tick(totalElapsed, totalDistance)`) from
 *    the page's timer/GPS loop; it owns only the per-segment clock and
 *    odometer.
 *  - `skip(totalElapsed, totalDistance)` forces the advance `tick` would
 *    take — one shared advance path, nothing to keep mirrored.
 *  - distance-based segments complete on metres covered; duration-based on
 *    seconds elapsed. A non-positive target advances immediately (bounded
 *    walk), so a degenerate zero-length segment can never wedge a run.
 *
 * STRUCT-SESS-03 change vs the old machine: the per-segment clock anchors
 * on the PUSHED `totalElapsed` (the page timer, which is pause-corrected)
 * instead of `Date.now()`. The old interval machine ran on wall clock, so
 * pausing mid-rep silently burned the rep; the old guided hook carried its
 * own private pause accounting to avoid exactly that. One anchor now makes
 * every structured session pause-correct by construction.
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
  skip: (totalElapsed: number, totalDistance: number) => void;
}

const IDLE: SessionPlayerState = {
  index: -1,
  phaseElapsed: 0,
  phaseDistanceCovered: 0,
};

function targetMet(
  seg: SessionSegment,
  elapsed: number,
  dist: number
): boolean {
  if (seg.target.kind === "distance") {
    return seg.target.meters <= 0 || dist >= seg.target.meters;
  }
  return seg.target.seconds <= 0 || elapsed >= seg.target.seconds;
}

export function useSessionPlayer(
  segments: SessionSegment[] | null | undefined
): SessionPlayer {
  // Stable identity for the empty fallback — `?? []` would mint a new
  // array every render and churn every callback below on the hot in-run
  // path.
  const segs = useMemo(() => segments ?? [], [segments]);
  const [state, setState] = useState<SessionPlayerState>(IDLE);

  const phaseStartElapsed = useRef(0);
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
    // The page starts the session at timer zero; the first tick's elapsed
    // re-anchors implicitly through advance() on every later segment.
    phaseStartElapsed.current = 0;
    phaseStartDistance.current = 0;
    setState({ index: 0, phaseElapsed: 0, phaseDistanceCovered: 0 });
  }, [segs.length]);

  const advance = useCallback(
    (
      prev: SessionPlayerState,
      totalElapsed: number,
      totalDistance: number
    ): SessionPlayerState => {
      let index = prev.index + 1;
      phaseStartElapsed.current = totalElapsed;
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
    (totalElapsed: number, totalDistance: number) => {
      if (segs.length === 0) return;
      setState((prev) => {
        if (prev.index < 0 || prev.index >= segs.length) return prev;
        const phaseElapsed = totalElapsed - phaseStartElapsed.current;
        const phaseDistanceCovered = totalDistance - phaseStartDistance.current;
        const seg = segs[prev.index];
        if (targetMet(seg, phaseElapsed, phaseDistanceCovered)) {
          return advance(prev, totalElapsed, totalDistance);
        }
        return { ...prev, phaseElapsed, phaseDistanceCovered };
      });
    },
    [segs, advance]
  );

  const skip = useCallback(
    (totalElapsed: number, totalDistance: number) => {
      if (segs.length === 0) return;
      setState((prev) => {
        if (prev.index < 0 || prev.index >= segs.length) return prev;
        return advance(prev, totalElapsed, totalDistance);
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
