/**
 * When a GPS run's clock starts (Run25 call 2): on the first fix good
 * enough to measure from, not on the tap of Start.
 *
 * A run whose clock starts before the phone knows where it is counts the
 * seconds spent finding GPS as running, and starts its distance from
 * wherever the first rough fix put it. So a GPS run's clock, its distance
 * and its session steps wait for a fix within `GPS_START_ACCURACY_M`. The
 * run screen watches location from the moment it opens, and through the
 * 3-2-1 after Start (useGpsWarmup, Run27 (1)), so a fix like that is
 * usually in hand already at Go (`isFixInHand`), and the run starts then.
 * When it is not, the screen says "Finding GPS" until one arrives, and its
 * Start anyway starts the clock at once and counts distance from the first
 * fix the reading gate passes (gps.ts `readingVerdict`).
 *
 * A run with no GPS (a treadmill, a run tracked without GPS) counts down
 * and never waits.
 */

/**
 * The accuracy, in metres, a fix needs to start a GPS run's clock. A Tropos
 * heuristic: above the 15 m the run screen calls a good signal (useGPS
 * `getSignalQuality`), so a phone with a lock passes at once, and inside
 * the 35 m the reading gate holds a running trace to, so the first point
 * is as good as the points that will be measured from it.
 */
export const GPS_START_ACCURACY_M = 20;

/**
 * How old a fix may be, in ms, and still be the one in hand at Go. A
 * Tropos heuristic: the run screen's watch gives a fix about
 * every second while the phone moves, so on a phone that is moving the
 * latest fix is never this old; on one standing still at the start, where
 * a watch may go quiet, a fix from 10 s ago is still where the runner
 * stands, and the lock it came from has not gone in that time.
 */
export const GPS_START_FIX_MAX_AGE_MS = 10_000;

/** A fix's reported accuracy and when it was taken, in epoch ms. */
export interface StartFixCandidate {
  accuracy: number;
  at: number;
}

/** Whether a fix is accurate enough to start a GPS run's clock on. */
export function isStartAccuracy(accuracy: number): boolean {
  return (
    Number.isFinite(accuracy) &&
    accuracy >= 0 &&
    accuracy <= GPS_START_ACCURACY_M
  );
}

/**
 * Whether a fix taken before Go is in hand at `now`: accurate enough to
 * start on, and recent enough to say where the runner is. A fix stamped
 * after `now` is a clock out of step, and is not believed.
 */
export function isFixInHand(
  fix: StartFixCandidate | null | undefined,
  now: number
): boolean {
  if (!fix || !isStartAccuracy(fix.accuracy)) return false;
  const age = now - fix.at;
  return age >= 0 && age <= GPS_START_FIX_MAX_AGE_MS;
}
