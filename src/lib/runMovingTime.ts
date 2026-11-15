/**
 * A run's moving time when auto-pause was off (Run28 call 1), as Strava
 * keeps it: "a run with no pause events gets its moving time from GPS".
 *
 * With auto-pause off the clock runs through every stop, so the timer is
 * the run's elapsed time. Here the GPS-only auto-pause rule
 * (`runAutoPause.ts`: under `GPS_STATIONARY_MPS` held for
 * `GPS_STOP_WINDOW_MS` stops it, `GPS_MOVING_MPS` starts it again, a
 * recovery segment is never stopped) is replayed over the fixes the run
 * screen saw, and each point of the trace is given the `pausedMs` live
 * auto-pause would have given it. The saved duration, the average pace and
 * the splits then read the moving time; the distance does not change.
 *
 * Which runs get it: an outdoor GPS run with auto-pause off, never paused
 * by hand, with a trace of two points or more that holds no hold already
 * (a run resumed after the app closed was held while it was away). Every
 * other run keeps its timer, as on Strava: a manual pause means timer time,
 * a treadmill run and a run with no trace have nothing to replay, and a run
 * with auto-pause on was timed by it.
 *
 * Pure: the run screen passes what it recorded.
 */
import {
  MAX_PLAUSIBLE_SPEED_MPS,
  pausedMsOf,
  segmentMetres,
  type GPSPoint,
} from "./gps";
import {
  AUTO_PAUSE_IDLE,
  stepAutoPause,
  type AutoPauseState,
} from "./runAutoPause";

/** A fix as auto-pause reads it (`gpsSpeed`): when it was taken, its
 *  speed and its accuracy. */
export type MovingFix = Pick<GPSPoint, "timestamp" | "speed" | "accuracy">;

/** When the session player was in a recovery segment, epoch ms; `to` null
 *  while it still was at the finish. */
export interface RecoveryWindow {
  from: number;
  to: number | null;
}

/** A stretch auto-pause would have held the clock for, epoch ms. */
export interface MovingHold {
  from: number;
  to: number;
}

export interface MovingTimeInput {
  /** The trace, as useGPS recorded it. */
  points: readonly GPSPoint[];
  /** Every fix the run screen read while the clock ran, oldest first. */
  fixes: readonly MovingFix[];
  /** The plan's rest, when the clock is never stopped. */
  recoveries: readonly RecoveryWindow[];
  /** When the clock started (`recordingStartedAt`), null when unknown. */
  startedAt: number | null;
  /** When the run was finished. */
  finishedAt: number;
  /** The timer's seconds. */
  elapsedSeconds: number;
  autoPause: boolean;
  /** An outdoor GPS run (`isOutdoorGpsRun`): not the treadmill, not a
   *  distance typed in. */
  outdoorGps: boolean;
  /** The run was paused by hand at any point. */
  pausedByHand: boolean;
}

export interface MovingTime {
  /** "trace" when the moving time was read from the trace, "timer" when
   *  the run keeps its timer. */
  source: "trace" | "timer";
  /** The trace with the replayed holds in its `pausedMs`. */
  points: GPSPoint[];
  /** The run's moving time, seconds: the timer less the holds. */
  seconds: number;
  /** Seconds taken out of the timer. */
  heldSeconds: number;
}

/** Whether a run's moving time is read from its trace (see the header). */
export function readsMovingTimeFromTrace(input: MovingTimeInput): boolean {
  return (
    !input.autoPause &&
    input.outdoorGps &&
    !input.pausedByHand &&
    input.startedAt !== null &&
    Number.isFinite(input.startedAt) &&
    input.finishedAt > input.startedAt &&
    input.points.length >= 2 &&
    input.fixes.length > 0 &&
    input.points.every((p) => pausedMsOf(p) === 0)
  );
}

/** A fix as the point `stepAutoPause` reads: only its time, speed and
 *  accuracy are read. */
function fixPoint(fix: MovingFix): GPSPoint {
  return {
    lat: 0,
    lon: 0,
    rawLat: 0,
    rawLon: 0,
    altitude: null,
    timestamp: fix.timestamp,
    speed: fix.speed,
    accuracy: fix.accuracy,
  };
}

/**
 * The stretches the GPS-only auto-pause rule would have held the clock
 * for, from `startedAt` to `finishedAt`. It is stepped as the run screen
 * steps it: at each fix, when the plan enters or leaves a recovery, and
 * when a pending window closes with nothing new (`recheckAt`), so a fix
 * that went stale meanwhile stops nothing. A recovery segment ends a hold
 * and is never held.
 */
export function replayAutoPause(
  fixes: readonly MovingFix[],
  recoveries: readonly RecoveryWindow[],
  startedAt: number,
  finishedAt: number
): MovingHold[] {
  const inRange: MovingFix[] = [];
  for (const fix of fixes) {
    if (
      Number.isFinite(fix.timestamp) &&
      fix.timestamp >= startedAt &&
      fix.timestamp <= finishedAt &&
      (inRange.length === 0 || fix.timestamp > inRange.at(-1)!.timestamp)
    )
      inRange.push(fix);
  }
  const windows = recoveries
    .map((w) => ({ from: w.from, to: w.to ?? finishedAt }))
    .filter((w) => Number.isFinite(w.from) && w.to > w.from);
  const recovering = (at: number) =>
    windows.some((w) => w.from <= at && at < w.to);
  const boundaries = [
    ...new Set(windows.flatMap((w) => [w.from, w.to])),
  ]
    .filter((at) => at > startedAt && at <= finishedAt)
    .sort((a, b) => a - b);

  const holds: MovingHold[] = [];
  let state: AutoPauseState = AUTO_PAUSE_IDLE;
  let latest: GPSPoint | null = null;
  let recheckAt: number | null = null;
  let heldSince: number | null = null;
  const endHold = (at: number) => {
    if (heldSince !== null && at > heldSince)
      holds.push({ from: heldSince, to: at });
    heldSince = null;
  };
  const step = (now: number) => {
    const inRecovery = recovering(now);
    if (inRecovery && state.paused) {
      endHold(now);
      state = { ...AUTO_PAUSE_IDLE, armedAt: state.armedAt };
    }
    const next = stepAutoPause(state, {
      now,
      gps: latest,
      motion: null,
      inRecovery,
    });
    state = next.state;
    recheckAt =
      next.recheckAt !== null && next.recheckAt > now ? next.recheckAt : null;
    if (next.change === "pause") heldSince = now;
    else if (next.change === "resume") endHold(now);
  };

  let f = 0;
  let b = 0;
  for (;;) {
    const fixAt = f < inRange.length ? inRange[f].timestamp : Infinity;
    const boundaryAt = b < boundaries.length ? boundaries[b] : Infinity;
    const due = recheckAt ?? Infinity;
    const at = Math.min(fixAt, boundaryAt, due);
    if (!(at <= finishedAt)) break;
    if (at === fixAt) {
      // A fix at the same moment as a boundary or a recheck is read with
      // it: the step re-reads everything.
      latest = fixPoint(inRange[f++]);
      if (boundaryAt === at) b++;
    } else if (at === boundaryAt) {
      b++;
    }
    step(at);
  }
  endHold(finishedAt);
  return holds;
}

/** Milliseconds of `holds` before `at`. */
function heldBefore(holds: readonly MovingHold[], at: number): number {
  let ms = 0;
  for (const hold of holds) {
    if (hold.from >= at) break;
    ms += Math.min(hold.to, at) - hold.from;
  }
  return ms;
}

/**
 * The trace with `holds` in its `pausedMs`, and the milliseconds taken out.
 *
 * A point inside a hold gets the time held up to it, as a point recorded
 * at the end of a live hold does. One rule keeps the distance: every step
 * keeps the metres it credited (`segmentMetres`), which across a hold are
 * capped at `MAX_PLAUSIBLE_SPEED_MPS` times the step's moving time, so a
 * step keeps at least the time that speed needs for its metres, plus a
 * millisecond. A Tropos heuristic: drift while standing is a few metres a
 * step, so it keeps well under a second of a stop, and the run's distance,
 * its splits and its best efforts add up to the same metres as before.
 */
export function withHolds(
  points: readonly GPSPoint[],
  holds: readonly MovingHold[],
  finishedAt: number
): { points: GPSPoint[]; heldMs: number } {
  if (points.length === 0 || holds.length === 0)
    return { points: [...points], heldMs: 0 };
  const stamped = (point: GPSPoint, extra: number): GPSPoint => {
    const ms = pausedMsOf(point) + extra;
    return ms > 0 ? { ...point, pausedMs: ms } : point;
  };
  let added = heldBefore(holds, points[0].timestamp);
  const out: GPSPoint[] = [stamped(points[0], added)];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const wanted =
      heldBefore(holds, b.timestamp) - heldBefore(holds, a.timestamp);
    const metres = b.breakBefore ? 0 : segmentMetres(a, b);
    const keepMs =
      metres > 0 ? Math.ceil((metres / MAX_PLAUSIBLE_SPEED_MPS) * 1000) + 1 : 0;
    const movingMs = b.timestamp - pausedMsOf(b) - (a.timestamp - pausedMsOf(a));
    added += Math.max(0, Math.min(wanted, movingMs - keepMs));
    out.push(stamped(b, added));
  }
  const last = points[points.length - 1];
  const after =
    heldBefore(holds, finishedAt) - heldBefore(holds, last.timestamp);
  return { points: out, heldMs: added + Math.max(0, after) };
}

/** The run's moving time: from its trace when it qualifies (see the
 *  header), else its timer. */
export function movingTimeOf(input: MovingTimeInput): MovingTime {
  const timer: MovingTime = {
    source: "timer",
    points: [...input.points],
    seconds: input.elapsedSeconds,
    heldSeconds: 0,
  };
  if (!readsMovingTimeFromTrace(input)) return timer;
  const holds = replayAutoPause(
    input.fixes,
    input.recoveries,
    input.startedAt!,
    input.finishedAt
  );
  const { points, heldMs } = withHolds(input.points, holds, input.finishedAt);
  const heldSeconds = Math.min(
    Math.round(heldMs / 1000),
    Math.max(0, input.elapsedSeconds)
  );
  return {
    source: "trace",
    points,
    seconds: input.elapsedSeconds - heldSeconds,
    heldSeconds,
  };
}
