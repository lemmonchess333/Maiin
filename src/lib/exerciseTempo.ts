/**
 * Authored-tempo parsing for the exercise rig demo (Demo1 lock).
 *
 * `Exercise.tempo` is an eccentric-first "down-pause-up" string in seconds
 * (e.g. "3-1-1"). The rig's teaching rep derives its phase durations from it
 * when present, clamped to a calm, readable band — the visible duration is a
 * teaching aid, not a literal timing promise. Absent/malformed tempo falls
 * back to the rig's global defaults (the pre-Demo1 constants).
 */

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

const clamp = (ms: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, ms));

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
  | "done";

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

/** Total rep duration including the set lead-in and the lockout beat
 *  (the lockout beat reuses holdMs — same length as the bottom pause). */
export function repTotalMs(timing: RepTiming): number {
  return (
    SET_BEAT_MS + timing.downMs + timing.holdMs + timing.upMs + timing.holdMs
  );
}

/** The rep sample at `elapsedMs` since the rep started. Monotonic in
 *  time; elapsed past repTotalMs settles on "done" at calm effort. */
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
