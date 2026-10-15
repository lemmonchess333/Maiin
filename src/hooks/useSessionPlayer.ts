import { useState, useCallback, useMemo } from "react";
import { isWorkSegment, type SessionSegment } from "@/lib/runSegments";

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
  /**
   * The time and distance run in the session's work segments so far, the
   * one in progress included, given the run's totals now; null for a
   * session with none, or before any has started. The session is judged
   * by these, not by the whole run, whose warm-up and cool-down read slow.
   */
  workPortion: (
    totalElapsed: number,
    totalDistance: number
  ) => WorkPortion | null;
}

/** Seconds and metres in a session's work segments. */
export interface WorkPortion {
  seconds: number;
  meters: number;
}

interface SegmentStart {
  readonly elapsed: number;
  readonly distance: number;
}

/** Progress and its anchors commit together. React may replay an updater,
 * so transitions never mutate refs outside the state they receive. */
interface PlayerSnapshot {
  readonly progress: SessionPlayerState;
  readonly phaseStart: SegmentStart;
  readonly segmentStarts: readonly SegmentStart[];
}

const IDLE: PlayerSnapshot = {
  progress: {
    index: -1,
    phaseElapsed: 0,
    phaseDistanceCovered: 0,
  },
  phaseStart: { elapsed: 0, distance: 0 },
  segmentStarts: [],
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
  const [snapshot, setSnapshot] = useState<PlayerSnapshot>(IDLE);
  const { progress: state, segmentStarts } = snapshot;

  const start = useCallback(() => {
    if (segs.length === 0) return;
    setSnapshot((prev) => {
      if (prev.progress.index !== -1) return prev;
      // The page starts at timer zero. Guard against the queued state so
      // a second start cannot reset a tick that has not committed yet.
      const phaseStart = { elapsed: 0, distance: 0 };
      return {
        progress: { index: 0, phaseElapsed: 0, phaseDistanceCovered: 0 },
        phaseStart,
        segmentStarts: [phaseStart],
      };
    });
  }, [segs.length]);

  const advance = useCallback(
    (
      prev: PlayerSnapshot,
      totalElapsed: number,
      totalDistance: number
    ): PlayerSnapshot => {
      let index = prev.progress.index + 1;
      // Bounded walk past degenerate zero-target segments.
      while (index < segs.length && targetMet(segs[index], 0, 0)) {
        index += 1;
      }
      // Every segment passed over starts, and ends, here.
      const starts = [...prev.segmentStarts];
      const phaseStart = { elapsed: totalElapsed, distance: totalDistance };
      for (
        let i = prev.progress.index + 1;
        i <= index && i <= segs.length;
        i++
      ) {
        starts[i] = phaseStart;
      }
      return {
        progress: { index, phaseElapsed: 0, phaseDistanceCovered: 0 },
        phaseStart,
        segmentStarts: starts,
      };
    },
    [segs]
  );

  const tick = useCallback(
    (totalElapsed: number, totalDistance: number) => {
      if (segs.length === 0) return;
      setSnapshot((prev) => {
        const { progress, phaseStart } = prev;
        if (progress.index < 0 || progress.index >= segs.length) return prev;
        const phaseElapsed = totalElapsed - phaseStart.elapsed;
        const phaseDistanceCovered = totalDistance - phaseStart.distance;
        const seg = segs[progress.index];
        if (targetMet(seg, phaseElapsed, phaseDistanceCovered)) {
          return advance(prev, totalElapsed, totalDistance);
        }
        if (
          progress.phaseElapsed === phaseElapsed &&
          progress.phaseDistanceCovered === phaseDistanceCovered
        ) {
          return prev;
        }
        return {
          ...prev,
          progress: { ...progress, phaseElapsed, phaseDistanceCovered },
        };
      });
    },
    [segs, advance]
  );

  const skip = useCallback(
    (totalElapsed: number, totalDistance: number) => {
      if (segs.length === 0) return;
      setSnapshot((prev) => {
        if (prev.progress.index < 0 || prev.progress.index >= segs.length)
          return prev;
        return advance(prev, totalElapsed, totalDistance);
      });
    },
    [segs, advance]
  );

  const workPortion = useCallback(
    (totalElapsed: number, totalDistance: number): WorkPortion | null => {
      let seconds = 0;
      let meters = 0;
      let started = false;
      segs.forEach((seg, i) => {
        if (!isWorkSegment(seg)) return;
        const from = segmentStarts[i];
        if (!from) return;
        started = true;
        const to = segmentStarts[i + 1] ?? {
          elapsed: totalElapsed,
          distance: totalDistance,
        };
        seconds += Math.max(0, to.elapsed - from.elapsed);
        meters += Math.max(0, to.distance - from.distance);
      });
      return started ? { seconds, meters } : null;
    },
    [segs, segmentStarts]
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
    workPortion,
  };
}
