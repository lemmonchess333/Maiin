/**
 * The step of a structured run the Watch shows: the live segment's heading
 * and prescription, what is left of it, the step after it, and which haptic
 * marks its start. Runna's core promise is the workout on the wrist; this is
 * Tropos's, in the one-authority contract of
 * docs/proposals/connected-training.md: the phone's session player decides
 * the step, and the Watch draws what it is sent and buzzes when the step
 * changes. The Watch never
 * advances a step, times one, or reads the segment list itself.
 *
 * The words are the Run screen's own (`stepEyebrow`, `stepHeadline`), so the
 * wrist and the phone never name a step differently.
 */
import {
  isWorkSegment,
  stepEyebrow,
  stepHeadline,
  type SessionSegment,
} from "./runSegments";
import type { DistanceUnit } from "./distanceUnits";

/** How hard the live step is: what colour the Watch gives it. */
export type WatchStepEffort = "work" | "easy" | "recovery";

/**
 * The haptic that marks a step's start, from the step before it: effort up
 * (a rep or a run after a walk), effort down (a recovery, a cool-down, a
 * walk), the same effort, or every step done. Absent on the first step,
 * which starts with the run rather than changing anything.
 */
export type WatchStepHaptic = "start" | "stop" | "next" | "done";

export interface WatchRunStep {
  /** The live step, from 0; `total` once every step is done. */
  index: number;
  total: number;
  /** Its heading: effort words and place ("HARD · REP 3/5"). */
  eyebrow?: string;
  /** Its prescription, a pace target included where it has one. */
  headline?: string;
  effort?: WatchStepEffort;
  /** What is left at the snapshot's `recordedAtMs`: whole seconds of a
   *  timed step, rounded up as the Run screen's countdown is, or metres of
   *  a measured one. */
  remainingSeconds?: number;
  remainingMeters?: number;
  /** How much of the live step is done, 0 to 1. */
  progress?: number;
  /** The next step's prescription; absent on the last step. */
  next?: string;
  haptic?: WatchStepHaptic;
}

/** The native bridge drops a longer line rather than carry it, and the
 *  Watch could not show it whole anyway. A Tropos heuristic: the longest
 *  heading or prescription the builders write is under 40 characters. */
export const WATCH_STEP_TEXT_MAX = 64;
/** More steps than a Watch can usefully count through; a session this long
 *  shows no steps on the wrist rather than a broken count. The longest the
 *  builders make, a run-walk, is under 50. A Tropos heuristic. */
export const WATCH_STEP_MAX_STEPS = 200;

function clip(text: string): string {
  return text.length <= WATCH_STEP_TEXT_MAX
    ? text
    : `${text.slice(0, WATCH_STEP_TEXT_MAX - 1).trimEnd()}…`;
}

function effortOf(segment: SessionSegment): WatchStepEffort {
  if (isWorkSegment(segment)) return "work";
  return segment.type === "recovery" ? "recovery" : "easy";
}

/** How much running a step asks for, to tell effort up from effort down: a
 *  rep or a block, then easy running, then everything gentler (a warm-up
 *  or a cool-down, a recovery, a run-walk's walks). */
function levelOf(segment: SessionSegment): number {
  if (isWorkSegment(segment)) return 2;
  return segment.type === "easy" ? 1 : 0;
}

function hapticInto(
  previous: SessionSegment | undefined,
  current: SessionSegment
): WatchStepHaptic | undefined {
  if (!previous) return undefined;
  const from = levelOf(previous);
  const to = levelOf(current);
  return to > from ? "start" : to < from ? "stop" : "next";
}

/**
 * The step to send with a run snapshot, from the session player's state.
 * Null when the run has no steps, the player has not started, or the
 * session is too long to count on the wrist.
 */
export function watchRunStep({
  segments,
  index,
  phaseElapsed,
  phaseDistanceCovered,
  unit,
  band,
}: {
  segments: readonly SessionSegment[] | null | undefined;
  index: number;
  phaseElapsed: number;
  phaseDistanceCovered: number;
  unit: DistanceUnit;
  band?: [number, number];
}): WatchRunStep | null {
  const total = segments?.length ?? 0;
  if (
    !segments ||
    total === 0 ||
    total > WATCH_STEP_MAX_STEPS ||
    !Number.isSafeInteger(index) ||
    index < 0
  )
    return null;
  if (index >= total) return { index: total, total, haptic: "done" };
  const current = segments[index];
  const next = segments[index + 1];
  const step: WatchRunStep = {
    index,
    total,
    eyebrow: clip(stepEyebrow(current)),
    headline: clip(stepHeadline(current, unit, band)),
    effort: effortOf(current),
  };
  const target = current.target;
  if (target.kind === "duration" && target.seconds > 0) {
    const done = Math.max(0, phaseElapsed);
    step.remainingSeconds = Math.max(0, Math.ceil(target.seconds - done));
    step.progress = Math.min(1, done / target.seconds);
  } else if (target.kind === "distance" && target.meters > 0) {
    const done = Math.max(0, phaseDistanceCovered);
    step.remainingMeters = Math.max(0, Math.round(target.meters - done));
    step.progress = Math.min(1, done / target.meters);
  }
  if (next) step.next = clip(stepHeadline(next, unit, band));
  const haptic = hapticInto(segments[index - 1], current);
  if (haptic) step.haptic = haptic;
  return step;
}

/**
 * Whether a value is a step the Watch can be sent: the shape above, inside
 * its bounds. The bridge sends nothing it would not accept itself.
 */
export function isWatchRunStep(value: unknown): value is WatchRunStep {
  if (!value || typeof value !== "object") return false;
  const step = value as Partial<WatchRunStep>;
  const text = (v: unknown) =>
    v === undefined ||
    (typeof v === "string" && v.length > 0 && v.length <= WATCH_STEP_TEXT_MAX);
  const figure = (v: unknown, max: number) =>
    v === undefined ||
    (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max);
  return (
    Number.isSafeInteger(step.total) &&
    step.total! > 0 &&
    step.total! <= WATCH_STEP_MAX_STEPS &&
    Number.isSafeInteger(step.index) &&
    step.index! >= 0 &&
    step.index! <= step.total! &&
    text(step.eyebrow) &&
    text(step.headline) &&
    text(step.next) &&
    (step.effort === undefined ||
      step.effort === "work" ||
      step.effort === "easy" ||
      step.effort === "recovery") &&
    (step.haptic === undefined ||
      step.haptic === "start" ||
      step.haptic === "stop" ||
      step.haptic === "next" ||
      step.haptic === "done") &&
    // A day of seconds, 100 km of metres: the bounds the native bridge
    // checks too.
    figure(step.remainingSeconds, 86_400) &&
    figure(step.remainingMeters, 100_000) &&
    figure(step.progress, 1)
  );
}
