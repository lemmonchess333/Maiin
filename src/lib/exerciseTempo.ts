/**
 * Authored-tempo parsing for the exercise rig demo (Demo1 lock).
 *
 * `Exercise.tempo` is an eccentric-first "down-pause-up" string in seconds
 * (e.g. "3-1-1"). The rig's teaching rep derives its phase durations from it
 * when present, clamped to a calm, readable band — the visible duration is a
 * teaching aid, not a literal timing promise. Absent/malformed tempo falls
 * back to the rig's global defaults (the pre-Demo1 constants).
 */
import { clamp } from "@/lib/utils";

export interface RepTiming {
  downMs: number;
  holdMs: number;
  upMs: number;
}

/** The pre-Demo1 global timing — the fallback when no tempo is authored.
 *  Asymmetric on purpose: a controlled eccentric is slower than the drive. */
export const DEFAULT_REP_TIMING: RepTiming = {
  downMs: 1650,
  holdMs: 480,
  upMs: 1050,
};

// Readability clamps: a 0-second authored phase still renders as a beat the
// eye can follow; a 9-second eccentric would read as a frozen demo.
const MIN_MOVE_MS = 500;
const MAX_MOVE_MS = 5000;
const MIN_HOLD_MS = 200;
const MAX_HOLD_MS = 2500;

/**
 * Parse "D-P-U" (seconds, eccentric-first) into clamped phase durations.
 * Returns null for anything that isn't three non-negative numbers — callers
 * fall back to DEFAULT_REP_TIMING.
 */
export function parseTempo(tempo: string | undefined | null): RepTiming | null {
  if (!tempo) return null;
  const parts = tempo.trim().split("-");
  if (parts.length !== 3) return null;
  // Number("") is 0, so an empty segment ("2--1") would silently pass — reject.
  if (parts.some((p) => p.trim() === "")) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const [down, pause, up] = nums;
  return {
    downMs: clamp(down * 1000, MIN_MOVE_MS, MAX_MOVE_MS),
    holdMs: clamp(pause * 1000, MIN_HOLD_MS, MAX_HOLD_MS),
    upMs: clamp(up * 1000, MIN_MOVE_MS, MAX_MOVE_MS),
  };
}

/** The rig's rep timing for an exercise: authored tempo when parseable,
 *  else the global default. */
export function repTimingFor(tempo: string | undefined | null): RepTiming {
  return parseTempo(tempo) ?? DEFAULT_REP_TIMING;
}

/* ── Rep phase timeline ─────────────────────────────────────────────
 *
 * The teaching rep's full sequence, as a pure elapsed-time → sample
 * function so the player's rAF loop holds no phase arithmetic and the
 * whole timeline is table-testable:
 *
 *   set → eccentric → pause → drive → lockout → done
 *
 * "set" is a short lead-in hold at the lockout frame BEFORE any motion —
 * the rep used to start moving on the very first frame, before the eye
 * had found the figure. "lockout" is the beat after the drive completes
 * (it was previously cued as still "Drive up" — a wrong teaching cue at
 * the exact moment the movement finishes).
 */

export type RepPhase =
  | "set"
  | "eccentric"
  | "pause"
  | "drive"
  | "lockout"
  | "done"
  | "cycle";

/**
 * Where a rep BEGINS, which is not derivable from `concentricTo`.
 *
 * `concentricTo` says which end of t is the finished position. It does
 * NOT say where the lifter starts: a squat and a deadlift both lock out
 * standing (t=0), but a squat starts there and descends, while a
 * deadlift starts with the bar on the floor and pulls up. Nine of the
 * fifteen demos start at the stretched end — every pull, press, curl,
 * raise and calf raise — and the player opened all of them at lockout,
 * so a deadlift demo began standing with the bar already at the hips
 * (owner, 2026-09-02: "it starts the video at the top of a lift,
 * deadlifts should start at the bottom").
 */
export type RepStart = "lockout" | "stretch";

/** Lead-in hold before the eccentric starts. */
export const SET_BEAT_MS = 600;

export interface RepSample {
  phase: RepPhase;
  /** Eccentric progress 0→1 (0 = lockout, 1 = deepest point). */
  ecc: number;
  /** Highlight intensity target for this phase — brightest through the
   *  concentric drive, controlled on the way down (pro-anatomy
   *  convention; the renderer low-passes toward it). */
  targetEffort: number;
}

/** One rep cycle (eccentric → pause → drive → lockout beat), without
 *  the set lead-in. */
export function repCycleMs(timing: RepTiming): number {
  return timing.downMs + timing.holdMs + timing.upMs + timing.holdMs;
}

/**
 * The LOOPING rep sample: one "Set" lead-in, then the rep cycle repeats
 * indefinitely — the gym-placard demo loop. Supersedes the Demo1
 * single-rep-then-settle behaviour (owner feedback 2026-07-27: "the
 * reps don't repeat properly" — the reference experience is the looping
 * demo screens on gym equipment). The player stops the loop by
 * unmounting / going inactive, not by a timeline end.
 */
export function repSampleLoopedAt(
  elapsedMs: number,
  timing: RepTiming,
  start: RepStart = "lockout"
): RepSample {
  const at = start === "stretch" ? repSampleStretchAt : repSampleAt;
  if (elapsedMs < SET_BEAT_MS) return at(elapsedMs, timing);
  const m = (elapsedMs - SET_BEAT_MS) % repCycleMs(timing);
  return at(SET_BEAT_MS + m, timing);
}

/**
 * The same beats for a rep that BEGINS at the stretched end: the set
 * lead-in holds the bottom, then drive → lockout → lower → pause, and
 * round again.
 *
 * Note it is a reordering, not an offset. Starting the lockout-first
 * timeline partway through would land on the right FRAME but the wrong
 * cue — the demo would open reading "Pause" — and the set lead-in, whose
 * whole job is to hold still until the eye finds the figure, would be
 * skipped.
 */
export function repSampleStretchAt(
  elapsedMs: number,
  timing: RepTiming
): RepSample {
  const { downMs, holdMs, upMs } = timing;
  let m = elapsedMs;
  if (m < SET_BEAT_MS) return { phase: "set", ecc: 1, targetEffort: 0.55 };
  m -= SET_BEAT_MS;
  if (m < upMs) return { phase: "drive", ecc: 1 - m / upMs, targetEffort: 1 };
  m -= upMs;
  if (m < holdMs) return { phase: "lockout", ecc: 0, targetEffort: 0.55 };
  m -= holdMs;
  if (m < downMs)
    return { phase: "eccentric", ecc: m / downMs, targetEffort: 0.45 };
  m -= downMs;
  if (m < holdMs) return { phase: "pause", ecc: 1, targetEffort: 0.8 };
  return { phase: "done", ecc: 1, targetEffort: 0.7 };
}

/** The rep sample at `elapsedMs` since the rep started. Monotonic in
 *  time; elapsed past one full rep settles on "done" at calm effort. */
export function repSampleAt(elapsedMs: number, timing: RepTiming): RepSample {
  const { downMs, holdMs, upMs } = timing;
  let m = elapsedMs;
  if (m < SET_BEAT_MS) return { phase: "set", ecc: 0, targetEffort: 0.55 };
  m -= SET_BEAT_MS;
  if (m < downMs)
    return { phase: "eccentric", ecc: m / downMs, targetEffort: 0.45 };
  m -= downMs;
  if (m < holdMs) return { phase: "pause", ecc: 1, targetEffort: 0.8 };
  m -= holdMs;
  if (m < upMs) return { phase: "drive", ecc: 1 - m / upMs, targetEffort: 1 };
  m -= upMs;
  if (m < holdMs) return { phase: "lockout", ecc: 0, targetEffort: 0.55 };
  return { phase: "done", ecc: 0, targetEffort: 0.7 };
}

/* ── Cycles ──────────────────────────────────────────────────────────
 *
 * A gait, a pedal stroke, a stair step, a jump-and-step-down: the pose
 * at t=1 IS the pose at t=0, and the movement never runs backwards. The
 * rep timeline above plays every demo there-and-back (drive, then the
 * eccentric is the same path reversed), which is right for a lift and
 * wrong for a walk — played back, a treadmill stride walks backwards
 * and a box jump floats down off the box. A cycle demo declares
 * `cycle: true` and the player advances t monotonically, wrapping at
 * the period, after the same one-time Set lead-in. */

/** Default period of one cycle (a brisk walking stride, a pedal turn). */
export const CYCLE_MS_DEFAULT = 1600;

/** The cycle sample at `elapsedMs`: the Set lead-in holds t=0, then t
 *  runs 0→1 over `cycleMs` and wraps — never reversing. Effort is
 *  steady: a cycle has no eccentric to soften on. */
export function cycleSampleAt(elapsedMs: number, cycleMs: number): RepSample {
  if (elapsedMs < SET_BEAT_MS)
    return { phase: "set", ecc: 0, targetEffort: 0.55 };
  const m = (elapsedMs - SET_BEAT_MS) % cycleMs;
  return { phase: "cycle", ecc: m / cycleMs, targetEffort: 0.85 };
}

/* ── Placard sequences ───────────────────────────────────────────────
 *
 * The third player mode, after the rep and the cycle: a demo that steps
 * through NAMED positions, holding on each long enough to read its cue,
 * and tweening between them. It is the gym-wall form placard — the
 * numbered panels of a technique card — animated, instead of six
 * stills printed side by side.
 *
 * Why it cannot be the rep player with captions bolted on. A rep is
 * timed like a rep: with the default tempo, six beats over one 3.66 s
 * cycle would give each caption ~600 ms. A seven-word line needs about
 * 1.8 s to read, so the text would strobe and teach nothing. The rep
 * timeline is also authored in eccentric/pause/concentric terms, which
 * is the wrong vocabulary for "chest to the floor" — a position, not a
 * phase.
 *
 * So the DWELL leads and the movement follows. The tempo module's own
 * contract already allows this: the visible duration is a teaching aid,
 * not a literal timing promise.
 */

export interface PlacardTiming {
  /** Still hold on each position — sized for reading its cue. */
  holdMs: number;
  /** Tween from one position to the next. */
  moveMs: number;
}

/** The widest cue a position may carry. It is a SCANNING limit for the
 *  step list, not a timing input any more; `bodyRig.test.ts` holds the
 *  authored cues to it. */
export const PLACARD_CUE_WORDS = 7;

/**
 * The hold is a LOOK budget, not a read budget — and that change is the
 * whole reason the loop got watchable.
 *
 * The first version put the cue under the figure, so every position had
 * to stay on screen long enough to READ a sentence: seven words at four
 * words a second is 1750 ms, and six of those plus the tweens made a
 * 14-second loop. A viewer arriving mid-set landed on "mid descent"
 * and waited ten seconds to see the top.
 *
 * The cues now live in the numbered list beneath the player, where they
 * are all visible at once and read at the reader's own pace, and the
 * label under the figure only NAMES the position. Recognising a name
 * and a pose takes about a second, so that is what the hold is. The
 * loop lands near nine seconds.
 */
export const PLACARD_TIMING: PlacardTiming = { holdMs: 1000, moveMs: 560 };

export interface PlacardSample {
  /** Which position we are on, or travelling FROM while `moving`. */
  index: number;
  /** 0 through the hold; 0→1 across the tween to the next position. */
  k: number;
  moving: boolean;
}

/**
 * The placard sample at `elapsedMs`. Every position gets an identical
 * slot (hold, then tween to the next), and the last position tweens
 * back to the first — so a sequence whose final position IS its first
 * (a rep that returns to the top) simply holds still across the wrap,
 * with no seam to special-case.
 */
export function placardSampleAt(
  elapsedMs: number,
  count: number,
  timing: PlacardTiming = PLACARD_TIMING
): PlacardSample {
  if (count <= 0) return { index: 0, k: 0, moving: false };
  const slot = timing.holdMs + timing.moveMs;
  const m = Math.max(0, elapsedMs) % (count * slot);
  const index = Math.min(count - 1, Math.floor(m / slot));
  const within = m - index * slot;
  const moving = within >= timing.holdMs;
  return {
    index,
    k: moving ? (within - timing.holdMs) / timing.moveMs : 0,
    moving,
  };
}
