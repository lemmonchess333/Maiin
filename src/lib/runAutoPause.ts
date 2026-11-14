/**
 * Auto-pause: when a run's clock stops by itself, and when it starts again.
 *
 * Two kinds of evidence, combined by one pure step (`stepAutoPause`):
 *
 * - **GPS** (`gpsSpeed`): the speed of the latest accepted fix. Slow
 *   to answer, because a fix's speed is filtered, and it drifts: a phone
 *   standing at a crossing between tall buildings can read 1 to 2 m/s.
 * - **The phone's motion sensors** (`MotionReading`, native iOS only, from
 *   `runMotionSource.ts`): CoreMotion's pedometer, whose pause and resume
 *   events Apple built for a running app's auto-pause ("not only accurate,
 *   but it also has to be responsive", WWDC16 session 713), its step
 *   counts and cadence, delivered every 2.5 seconds while steps are being
 *   taken (WWDC14 session 612), and its activity classifier (stationary,
 *   walking, running), which reads running within three to five seconds
 *   wherever the phone is carried (WWDC14 612) and whose `stationary`
 *   means the phone itself is still, not that its position is
 *   (CMMotionActivity; WWDC14 612: "motion stationary and not location
 *   stationary").
 *
 * The rules, read top to bottom (`autoPauseEvidence`; the decision table
 * is `__tests__/runAutoPause.test.ts`):
 *
 * - Stepping (the pedometer or the classifier says the person is moving on
 *   foot) keeps the clock running and restarts it at once: a walk break,
 *   a slow climb, jogging on the spot at a crossing, a tunnel with no GPS.
 * - GPS at 1 m/s or more keeps or restarts it too, unless the phone itself
 *   reads still: then only `GPS_CLEARLY_MOVING_MPS` does (held for
 *   `GPS_OVERRIDE_HOLD_MS` to restart it). So drift at a crossing neither
 *   holds the clock running nor starts it again, and moving with no steps
 *   (a buggy, a wheelchair) is still seen.
 * - A recovery segment is the plan's rest (a run-walk's walk, a rep's
 *   recovery): its clock is never stopped, or a runner standing through a
 *   recovery would never be told to start the next rep.
 * - Stopped on foot (the pedometer's pause event, or the phone still)
 *   stops the clock after `MOTION_STOP_WINDOW_MS`.
 * - With no motion evidence (the web, which has no motion source; a phone
 *   that feels no steps), GPS under 0.5 m/s stops it after
 *   `GPS_STOP_WINDOW_MS`: the GPS-only rule, unchanged.
 *
 * Every number here is a Tropos heuristic unless a source is named beside
 * it.
 */
import type { GPSPoint } from "./gps";

/* ── GPS ───────────────────────────────────────────────────────────── */

/** A fix older than this is no evidence: two missed one-second fixes,
 *  never the whole five-second stop window. */
const GPS_FIX_MAX_AGE_MS = 2500;
/** The normal tracking gate after acquisition (useGPS). */
const GPS_ACCURACY_MAX_M = 35;
/** Under this, a fix reads as standing. */
export const GPS_STATIONARY_MPS = 0.5;
/** At or above this, a fix reads as moving. Between the two it is no
 *  evidence either way: the hysteresis that stops one reading flapping. */
export const GPS_MOVING_MPS = 1;
/** At or above this GPS overrides a still phone: above the 1 to 2 m/s a
 *  standing phone can drift, below an easy jog (2.5 m/s is 6:40 /km). The
 *  backstop for moving without steps the sensors read as still. */
export const GPS_CLEARLY_MOVING_MPS = 2.5;
/** How long GPS must hold `GPS_CLEARLY_MOVING_MPS` to restart a clock the
 *  sensors say is still: two more one-second fixes, so one drifting
 *  reading does not. */
export const GPS_OVERRIDE_HOLD_MS = 2000;

/** The speed of a fix that is fresh, accurate and has a speed; null when
 *  it is no evidence. A stale fix or an uncertain speed is no evidence
 *  that a runner stopped. */
export function gpsSpeed(point: GPSPoint | null, now: number): number | null {
  if (
    !point ||
    !Number.isFinite(point.timestamp) ||
    now - point.timestamp < 0 ||
    now - point.timestamp > GPS_FIX_MAX_AGE_MS ||
    !Number.isFinite(point.accuracy) ||
    point.accuracy < 0 ||
    point.accuracy > GPS_ACCURACY_MAX_M ||
    point.speed === null ||
    !Number.isFinite(point.speed) ||
    point.speed < 0
  )
    return null;
  return point.speed;
}

/* ── The phone's motion sensors ────────────────────────────────────── */

/** CoreMotion's activity, reduced to what auto-pause reads. `other` is a
 *  vehicle, a bike, or movement it cannot name (all flags false). */
export type MotionActivityKind =
  "stationary" | "walking" | "running" | "other" | "unknown";

/** One reading from the motion source, as `runMotionSource.ts` parses it.
 *  Times are epoch milliseconds from the phone's own clock. */
export type MotionSample =
  /** A pedometer update: the steps counted since the source started, and
   *  the cadence in steps a second (null until CoreMotion has one). */
  | { kind: "steps"; at: number; steps: number; cadence: number | null }
  /** The pedometer's pause (moving false) or resume event. */
  | { kind: "stepEvent"; at: number; moving: boolean }
  /** The activity classifier changed its answer. */
  | {
      kind: "activity";
      at: number;
      activity: MotionActivityKind;
      confidence: "low" | "medium" | "high";
    }
  /** The source cannot run: no sensor, Motion & Fitness refused. */
  | { kind: "unavailable" };

/** What the samples so far add up to, folded by `foldMotion`. In memory
 *  only: nothing here is stored or sent. */
export interface MotionReading {
  available: boolean;
  /** The pedometer's count at its latest update, to tell a rise. */
  steps: number | null;
  /** When steps were last counted at walking cadence or above. */
  stepAt: number | null;
  /** The pedometer's latest event. */
  stepEvent: { at: number; moving: boolean } | null;
  /** Rises counted at walking cadence since the latest pause event. */
  risesSincePause: number;
  /** The classifier's latest answer, `unknown` when it was unsure. */
  activity: { at: number; kind: MotionActivityKind } | null;
}

export const EMPTY_MOTION: MotionReading = {
  available: true,
  steps: null,
  stepAt: null,
  stepEvent: null,
  risesSincePause: 0,
  activity: null,
};

/** Steps counted within this long are fresh: the pedometer updates every
 *  2.5 s while steps are being taken (WWDC14 612), so this is two
 *  updates. */
export const STEP_FRESH_MS = 5000;
/** Steps a second at or above which counted steps are walking: 60 a
 *  minute, the bottom of "slow walking" (Tudor-Locke et al. 2018, Br J
 *  Sports Med, PMC6029645); under it is shuffling on the spot. */
export const MIN_WALKING_CADENCE = 1;

export function foldMotion(
  reading: MotionReading,
  sample: MotionSample
): MotionReading {
  switch (sample.kind) {
    case "unavailable":
      return { ...EMPTY_MOTION, available: false };
    case "stepEvent":
      return {
        ...reading,
        stepEvent: { at: sample.at, moving: sample.moving },
        risesSincePause: 0,
      };
    case "activity":
      // A low-confidence answer is no evidence, but it ends the last one:
      // the classifier has changed its mind (WWDC14 612: confidence trades
      // accuracy for latency).
      return {
        ...reading,
        activity: {
          at: sample.at,
          kind: sample.confidence === "low" ? "unknown" : sample.activity,
        },
      };
    case "steps": {
      const rose = reading.steps !== null && sample.steps > reading.steps;
      // The first update after the source starts counts if it holds any
      // steps: they were taken since the run's clock could see them.
      const first = reading.steps === null && sample.steps > 0;
      const walking =
        sample.cadence === null || sample.cadence >= MIN_WALKING_CADENCE;
      const counted = (rose || first) && walking;
      const afterPause =
        reading.stepEvent !== null &&
        !reading.stepEvent.moving &&
        sample.at > reading.stepEvent.at;
      return {
        ...reading,
        steps: sample.steps,
        stepAt: counted ? sample.at : reading.stepAt,
        risesSincePause:
          counted && afterPause
            ? reading.risesSincePause + 1
            : reading.risesSincePause,
      };
    }
  }
}

export type FootState = "stepping" | "stopped" | "unknown";

/**
 * Whether the sensors say the person is moving on foot.
 *
 * Each source gives evidence with a time, and the newest wins:
 * - stepping: the pedometer's resume event; the classifier reading walking
 *   or running; steps counted in the last `STEP_FRESH_MS` at walking
 *   cadence (after a pause event, only once two updates have counted them:
 *   the update that lands just after a stop still carries its last steps);
 * - stopped: the pedometer's pause event; the classifier reading the phone
 *   still while no steps are being counted.
 *
 * Stop evidence from before `since`, when auto-pause last came into play
 * (Go after the countdown, a Resume by hand), is not a stop: the person
 * has started since.
 */
export function footState(
  reading: MotionReading | null,
  now: number,
  since: number
): FootState {
  if (!reading?.available) return "unknown";
  const stepFresh =
    reading.stepAt !== null && now - reading.stepAt <= STEP_FRESH_MS;
  const event = reading.stepEvent;
  let goAt = -Infinity;
  let stopAt = -Infinity;
  if (event?.moving) goAt = event.at;
  if (event && !event.moving && event.at >= since) stopAt = event.at;
  const activity = reading.activity;
  if (activity?.kind === "walking" || activity?.kind === "running")
    goAt = Math.max(goAt, activity.at);
  if (activity?.kind === "stationary" && !stepFresh && activity.at >= since)
    stopAt = Math.max(stopAt, activity.at);
  const pausedSinceSteps = event !== null && !event.moving;
  if (stepFresh && (!pausedSinceSteps || reading.risesSincePause >= 2))
    goAt = Math.max(goAt, reading.stepAt!);
  if (goAt === -Infinity && stopAt === -Infinity) return "unknown";
  return goAt > stopAt ? "stepping" : "stopped";
}

/** Stopped, and the phone itself read still after `since`: the one
 *  reading that outweighs GPS's speed, as a still phone is not on a moving
 *  person. */
function phoneStill(
  reading: MotionReading | null,
  foot: FootState,
  now: number,
  since: number
): boolean {
  const activity = reading?.activity;
  return (
    foot === "stopped" &&
    activity?.kind === "stationary" &&
    activity.at >= since &&
    !(reading!.stepAt !== null && now - reading!.stepAt <= STEP_FRESH_MS)
  );
}

/* ── The decision ──────────────────────────────────────────────────── */

/** How long stop evidence must hold before the clock stops, when GPS is
 *  the only evidence. Unchanged from the GPS-only rule. */
export const GPS_STOP_WINDOW_MS = 5000;
/** The same when the sensors say the person stopped. The pedometer's
 *  pause event is already filtered against false starts (WWDC16 713);
 *  this only keeps a stumble or a half-second halt from stopping the
 *  clock. */
export const MOTION_STOP_WINDOW_MS = 2000;

export interface AutoPauseInput {
  now: number;
  /** The latest accepted fix (useGPS `currentPoint`). */
  gps: GPSPoint | null;
  /** The sensors' reading; null with no motion source (the web). */
  motion: MotionReading | null;
  /** The session player is in a recovery segment. */
  inRecovery: boolean;
}

/** Why the clock may stop, or must run: the decision table's column. */
export type AutoPauseReason =
  | "stepping"
  | "gps-moving"
  | "gps-clearly-moving"
  | "stopped-on-foot"
  | "gps-stationary"
  | "recovery"
  | "no-evidence";

export interface AutoPauseEvidence {
  /** Moving: `now` restarts the clock at once, `held` after
   *  `GPS_OVERRIDE_HOLD_MS`. Either keeps a running clock running. */
  go: "now" | "held" | null;
  /** Stopped: the clock stops once this has held this long. */
  stopAfterMs: number | null;
  reason: AutoPauseReason;
}

export function autoPauseEvidence(
  input: AutoPauseInput,
  since: number
): AutoPauseEvidence {
  const { now, motion, inRecovery } = input;
  const speed = gpsSpeed(input.gps, now);
  const foot = footState(motion, now, since);
  const still = phoneStill(motion, foot, now, since);
  if (foot === "stepping")
    return { go: "now", stopAfterMs: null, reason: "stepping" };
  if (speed !== null && speed >= GPS_MOVING_MPS && !still)
    return { go: "now", stopAfterMs: null, reason: "gps-moving" };
  if (speed !== null && speed >= GPS_CLEARLY_MOVING_MPS)
    return { go: "held", stopAfterMs: null, reason: "gps-clearly-moving" };
  if (inRecovery) return { go: null, stopAfterMs: null, reason: "recovery" };
  if (foot === "stopped")
    return {
      go: null,
      stopAfterMs: MOTION_STOP_WINDOW_MS,
      reason: "stopped-on-foot",
    };
  if (speed !== null && speed < GPS_STATIONARY_MPS)
    return {
      go: null,
      stopAfterMs: GPS_STOP_WINDOW_MS,
      reason: "gps-stationary",
    };
  return { go: null, stopAfterMs: null, reason: "no-evidence" };
}

/** The auto-pause state beside the run's phase. `armedAt` is when
 *  auto-pause last came into play: Go, or a Resume by hand (null while it
 *  is not in play). Stop evidence from before it is not a stop, since the
 *  person has started since; an auto-resume leaves it, so a still phone
 *  still counts after GPS alone restarted the clock. The two windows are
 *  when the current stop or go evidence began. */
export interface AutoPauseState {
  paused: boolean;
  armedAt: number | null;
  stoppingSince: number | null;
  goingSince: number | null;
}

export const AUTO_PAUSE_IDLE: AutoPauseState = {
  paused: false,
  armedAt: null,
  stoppingSince: null,
  goingSince: null,
};

export interface AutoPauseStep {
  state: AutoPauseState;
  change: "pause" | "resume" | null;
  /** When to look again if nothing new arrives: the moment a pending
   *  window would close. Evidence is re-read then, so a fix that went
   *  stale meanwhile stops nothing. */
  recheckAt: number | null;
  reason: AutoPauseReason;
}

/** One step of auto-pause, for a run whose clock auto-pause may stop
 *  (active, auto-pause on, an outdoor GPS run). Stopping needs its
 *  evidence to hold for the whole window; restarting is at once, except
 *  for GPS alone against a still phone. */
export function stepAutoPause(
  state: AutoPauseState,
  input: AutoPauseInput
): AutoPauseStep {
  const { now } = input;
  const armedAt = state.armedAt ?? now;
  const evidence = autoPauseEvidence(input, armedAt);
  const { reason } = evidence;
  const settled = (
    patch: Partial<AutoPauseState>,
    change: AutoPauseStep["change"] = null,
    recheckAt: number | null = null
  ): AutoPauseStep => ({
    state: {
      ...state,
      armedAt,
      stoppingSince: null,
      goingSince: null,
      ...patch,
    },
    change,
    recheckAt,
    reason,
  });
  if (state.paused) {
    if (evidence.go === "now") return settled({ paused: false }, "resume");
    if (evidence.go === null) return settled({});
    const goingSince = state.goingSince ?? now;
    if (now - goingSince >= GPS_OVERRIDE_HOLD_MS)
      return settled({ paused: false }, "resume");
    return settled({ goingSince }, null, goingSince + GPS_OVERRIDE_HOLD_MS);
  }
  if (evidence.stopAfterMs === null) return settled({});
  const stoppingSince = state.stoppingSince ?? now;
  if (now - stoppingSince >= evidence.stopAfterMs)
    return settled({ paused: true }, "pause");
  return settled({ stoppingSince }, null, stoppingSince + evidence.stopAfterMs);
}
