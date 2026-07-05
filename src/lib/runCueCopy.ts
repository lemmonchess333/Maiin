/**
 * Run coaching cue copy — the "warmer audio coaching" half of competitive
 * Tier-2 #9 and the "fix voices" pass.
 *
 * The old cues were terse and robotic ("Pick up the pace. You're falling
 * behind target.") and repeated identically every time. This module owns the
 * spoken copy as pure functions: warm, calm-brand phrasing with small
 * variation pools rotated by a caller-supplied counter (deterministic — no
 * Math.random, fully unit-testable). Everything is written for the EAR, not
 * the eye: "per kilometre" not "per K", no abbreviations the TTS engine
 * would mangle.
 */

export type SplitComparison = "faster" | "slower" | "steady" | null;

function pick(pool: string[], variant: number): string {
  return pool[Math.abs(variant) % pool.length];
}

const FASTER = [
  "Quicker than the last one — nice.",
  "That split was quicker. Strong.",
  "You're building speed.",
];
const SLOWER = [
  "A touch slower that split — no drama.",
  "Bit slower — find your rhythm again.",
  "Slower split. Settle back in.",
];
const STEADY = [
  "Right on rhythm.",
  "Steady as you like.",
  "Locked in. Keep it there.",
];

/** Distance-split cue: "3 kilometres. Pace 5:44 per kilometre. Locked in." */
export function splitCue(
  km: number,
  pace: string,
  comparison: SplitComparison,
  variant: number
): string {
  const kmLabel = Number.isInteger(km)
    ? `${km} kilometre${km === 1 ? "" : "s"}`
    : `${km.toFixed(1)} kilometres`;
  const base = `${kmLabel}. Pace ${pace} per kilometre.`;
  if (comparison === "faster") return `${base} ${pick(FASTER, variant)}`;
  if (comparison === "slower") return `${base} ${pick(SLOWER, variant)}`;
  if (comparison === "steady") return `${base} ${pick(STEADY, variant)}`;
  return base;
}

/** Time cue (every-5-minutes mode). */
export function timeCue(minutes: number, km: number): string {
  return `${minutes} minutes in. ${km.toFixed(1)} kilometres covered.`;
}

const BEHIND = [
  "You've drifted a little behind target — lift it gently.",
  "A touch slow just now. Ease back up to pace.",
];
const AHEAD = [
  "You're ahead of target — back off a touch and save it for later.",
  "Quicker than planned. Relax the pace a little.",
];

export function paceAlertCue(
  direction: "behind" | "ahead",
  variant: number
): string {
  return direction === "behind" ? pick(BEHIND, variant) : pick(AHEAD, variant);
}

const HALFWAY = [
  "That's halfway. The hard half is behind you — hold it steady.",
  "Halfway there. Keep it smooth.",
];

export function halfwayCue(variant: number): string {
  return pick(HALFWAY, variant);
}

const FINAL_500 = [
  "Five hundred metres to go. Finish strong.",
  "Last half kilometre — bring it home.",
];

export function final500Cue(variant: number): string {
  return pick(FINAL_500, variant);
}

export function pbCue(effortLabel: string): string {
  return `New personal best for ${effortLabel}. That's brilliant running.`;
}

/** Interval-phase cues (warmup / work / rest / cooldown / complete). */
export function phaseCue(
  phase: string,
  rep?: number,
  totalReps?: number
): string | null {
  switch (phase) {
    case "warmup":
      return "Warming up. Keep it easy and conversational.";
    case "work":
      return `Rep ${rep} of ${totalReps}. Push on!`;
    case "rest":
      return "Recovery. Shake it out — nice easy jog.";
    case "cooldown":
      return "Cooling down. Nice and easy from here.";
    case "complete":
      return "Session complete. Great work today.";
    default:
      return null;
  }
}
