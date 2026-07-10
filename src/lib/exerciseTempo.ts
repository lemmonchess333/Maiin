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
