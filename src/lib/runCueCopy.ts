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

/**
 * These fire on a 30-second cooldown for as long as the deviation holds,
 * so a long tempo can trigger them dozens of times. Two entries each made
 * that a metronome — the same two sentences alternating for most of an
 * hour. (The other half of that problem was the caller feeding in the
 * whole-run average, so the deviation never cleared; see
 * `rollingPaceSeconds` in gps.ts.)
 */
const BEHIND = [
  "You've drifted a little behind target — lift it gently.",
  "A touch slow just now. Ease back up to pace.",
  "Slightly off target pace. Pick the effort up a fraction.",
  "A little behind. Nothing dramatic — just lift the rhythm.",
  "Pace has eased off. Bring it back when you're ready.",
  "Just under target. Lengthen the stride a touch.",
];
const AHEAD = [
  "You're ahead of target — back off a touch and save it for later.",
  "Quicker than planned. Relax the pace a little.",
  "That's faster than target. Ease off and bank the energy.",
  "Ahead of pace. Settle back — there's a way to go yet.",
  "Running hot. Take the foot off a fraction.",
  "Quicker than needed. Let the pace come back to you.",
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

/** STRUCT-SESS-02: per-segment cue copy now lives ON the segments
 *  (runSegments.ts builders author it with the labels); only the terminal
 *  line stays here — it belongs to the session, not to any segment. */
export function sessionCompleteCue(): string {
  return "Session complete. Great work today.";
}

/* ── Repeated-segment vocabulary ──────────────────────────────────────
 *
 * The builders in `runSegments.ts` still AUTHOR their cues (STRUCT-SESS-02
 * above) — these give them something to author WITH.
 *
 * Every rep of an interval session said `Rep N of 5. Push on!` and every
 * recovery said, byte for byte, `Recovery. Shake it out — nice easy jog.`
 * Across a 5×1K that is five identical exhortations and five identical
 * rest lines; across a 10-rep session, twenty. Only the number moved.
 *
 * That is the exact failure THIS MODULE was created to fix — its header
 * says the old cues "repeated identically every time" — and the segment
 * builders never adopted it. The data was even kept for the purpose:
 * runSegments' header notes `rep`/`totalReps` survive "so the cue
 * vocabulary can keep announcing", and the vocabulary then used the
 * number and nothing else.
 *
 * Position is the thing worth speaking to, because the reps are NOT
 * interchangeable to the person running them:
 *   - the first is where people over-cook it and pay for it later;
 *   - the middle is where knowing how many remain actually helps;
 *   - the last is the one worth naming, and nothing ever did.
 * So these vary by position first and rotate within it, rather than
 * rotating blindly — a random-feeling shuffle would still tell the
 * runner nothing they can use.
 *
 * Deterministic, like the rest of the module: rotation is driven by the
 * caller's index, never Math.random, so the copy is unit-testable.
 */

// None of these restate "first" — the head already says "Rep 1 of 5",
// and "Rep 1 of 5. First rep." is the kind of line that sounds fine on
// the page and silly in your ear.
const REP_OPENING = [
  "Settle into the effort — don't over-cook it.",
  "Find the effort, don't fight it.",
  "Ease in. Plenty of work still to come.",
];
/**
 * Deep enough that a whole session's middle reps get their own line.
 *
 * The first version had four entries, which on an 8×400 gave reps 3 and 7
 * the identical clause "Keep the shoulders easy." — the same defect this
 * module is fixing, at reduced scale. It survived the test because
 * `Set(cues).size === n` counts the REP NUMBER, so a repeated clause still
 * reads as a unique string. That is precisely the tautology the header
 * below warns about for the old copy; writing the warning did not stop me
 * from reproducing it one layer down.
 *
 * Nine entries covers reps 2..9 without repetition. Longer sessions do
 * cycle, which is fine and is what the tests assert — the rule is
 * "no repeat within a normal session", not "infinite vocabulary".
 */
const REP_MIDDLE = [
  "Hold the effort.",
  "Same effort as the last one.",
  "Strong and relaxed.",
  "Keep the shoulders easy.",
  "Smooth breathing, steady turnover.",
  "Settle in — this is the pace.",
  "Relax the hands and jaw.",
  "Stay tall, drive from the hips.",
  "Right where you should be.",
];
const REP_FINAL = [
  "Last one. Everything you've got left.",
  "Final rep. Empty the tank.",
  "Last one — make it count.",
];

/**
 * `Rep 3 of 5. Two to go after this. Hold the effort.`
 *
 * `rep` is 1-based. The remaining-count only appears in the middle of a
 * session: on the first it competes with the settle-in instruction, and
 * on the last "zero to go" is noise — the runner knows.
 */
export function intervalRepCue(
  rep: number,
  totalReps: number,
  variant: number
): string {
  const head = `Rep ${rep} of ${totalReps}.`;
  if (rep === 1) return `${head} ${pick(REP_OPENING, variant)}`;
  if (rep >= totalReps) return `${head} ${pick(REP_FINAL, variant)}`;

  const left = totalReps - rep;
  // Stated on alternating middle reps only. Every single time turns a
  // useful fact into the wallpaper this whole change is removing.
  const remaining = rep % 2 === 0 ? ` ${left} to go after this.` : "";
  return `${head}${remaining} ${pick(REP_MIDDLE, variant)}`;
}

const RECOVERY = [
  "Recovery. Shake it out — nice easy jog.",
  "Ease down. Let the breathing come back.",
  "Recover. Loose and easy now.",
  "Jog it out. Drop the shoulders.",
];

/**
 * `Recovery. One rep to go. Loose and easy now.`
 *
 * `rep` is the rep just COMPLETED. The last recovery is named because it
 * is the one that changes how you run the next rep.
 */
export function intervalRecoveryCue(
  rep: number,
  totalReps: number,
  variant: number
): string {
  const left = totalReps - rep;
  if (left === 1) return `Recovery. One rep to go — make this one count.`;
  if (left > 1 && rep % 2 === 1) {
    return `Recovery. ${left} reps left. ${pick(RECOVERY, variant)}`;
  }
  return pick(RECOVERY, variant);
}

/** Same sizing reason as REP_MIDDLE — strides come in 4-8, and four
 *  entries put the same clause on stride 1 and stride 5. */
const STRIDE = [
  "Relaxed and fast.",
  "Quick feet, easy face.",
  "Smooth and light — not a sprint.",
  "Fast but loose.",
  "Let the legs turn over.",
  "Tall and springy.",
  "Effortless speed — no straining.",
];

/** `Stride 4 of 6. Quick feet, easy face.` */
export function strideRepCue(
  rep: number,
  totalReps: number,
  variant: number
): string {
  const head = `Stride ${rep} of ${totalReps}.`;
  if (rep >= totalReps) return `${head} Last one — relaxed and quick.`;
  return `${head} ${pick(STRIDE, variant)}`;
}

const FLOAT = [
  "Float. Easy running until the next block.",
  "Float it. Keep the legs turning over.",
  "Easy through the float — the next block comes soon.",
];

/** Between-block float on a tempo/threshold session. */
export function floatCue(variant: number): string {
  return pick(FLOAT, variant);
}
