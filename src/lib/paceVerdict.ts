/**
 * Post-run pace verdict — the Runna-style "how did that compare to the
 * session's target?" line on the run summary (competitive running-doc P0 #3:
 * per-session pace targets that visibly close the loop with actual
 * performance).
 *
 * Coaching-honest, adherence-neutral register (the nutrition rule applies
 * here too — never shame a slow day):
 *  - within the tolerance band → on-target praise
 *  - EASY/LONG sessions run notably faster than target get a gentle
 *    "easy days easy" nudge, NOT praise — the mistake every coach corrects
 *  - hard sessions run faster → strong day
 *  - slower → calm, no-drama framing
 *
 * Band-aware (Runna teardown #2): when the session has a pace BAND, the
 * verdict judges against the band edges (anywhere inside the window is
 * on-target — that's what the window means) and the copy speaks the range
 * ("the 5:25–5:45 /km window"), not a synthetic midpoint. Single-target
 * sessions (race pace) keep the original midpoint judgement.
 *
 * Pure: the caller resolves the target (resolveSessionPaces) and passes
 * seconds/km; this module only decides tone + copy.
 */

import { paceLabel, paceBandLabel } from "@/lib/runLabels";

/** ±grace (sec/km) beyond the target/band edge that still counts on-target. */
export const ON_TARGET_TOLERANCE_S = 10;

export interface PaceVerdict {
  tone: "on" | "fast" | "easy-too-fast" | "slow";
  line: string;
}

/** Session types where faster-than-target is a caution, not a win.
 *  Template vocabulary is "easy" | "long" (workoutTemplates.ts) — "longrun"
 *  and "recovery" are kept defensively for other callers' vocabularies.
 *  ("long" was missing pre-bands: a hot long run got "Strong day" praise
 *  instead of the easy-days-easy nudge this module documents.) */
const EASY_TYPES = new Set(["easy", "recovery", "long", "longrun"]);

export function resolvePaceVerdict(args: {
  /** Session template type (easy / tempo / intervals / long / race …). */
  templateType: string;
  /** Actual average pace, sec/km. */
  actualPaceS: number;
  /** Resolved target pace for the session, sec/km. */
  targetPaceS: number;
  /** Optional [fast, slow] band (sec/km) — when present, judgement runs
   *  against the band edges and the copy speaks the range. */
  targetBandS?: [number, number];
}): PaceVerdict | null {
  const { templateType, actualPaceS, targetPaceS, targetBandS } = args;
  if (
    !Number.isFinite(actualPaceS) ||
    !Number.isFinite(targetPaceS) ||
    actualPaceS <= 0 ||
    targetPaceS <= 0
  ) {
    return null;
  }
  const band =
    targetBandS &&
    Number.isFinite(targetBandS[0]) &&
    Number.isFinite(targetBandS[1]) &&
    targetBandS[0] > 0 &&
    targetBandS[1] >= targetBandS[0]
      ? targetBandS
      : null;

  const target = band
    ? `the ${paceBandLabel(band)} window`
    : paceLabel(targetPaceS);
  const actual = paceLabel(actualPaceS);

  // Signed distance from the acceptable zone: 0 inside, negative = faster
  // than the fast edge, positive = slower than the slow edge. A single
  // target degenerates to a zero-width band at targetPaceS.
  const fastEdge = band ? band[0] : targetPaceS;
  const slowEdge = band ? band[1] : targetPaceS;
  const diff =
    actualPaceS < fastEdge
      ? actualPaceS - fastEdge
      : actualPaceS > slowEdge
        ? actualPaceS - slowEdge
        : 0;

  if (Math.abs(diff) <= ON_TARGET_TOLERANCE_S) {
    return {
      tone: "on",
      line: band
        ? `Right on target — ${actual}, inside ${target}.`
        : `Right on target — ${actual} against a ${target} goal.`,
    };
  }
  if (diff < 0) {
    if (EASY_TYPES.has(templateType)) {
      return {
        tone: "easy-too-fast",
        line: band
          ? `Quicker than ${target} (${actual}). Keep the easy days easy — save it for the hard sessions.`
          : `Quicker than the ${target} easy target (${actual}). Keep the easy days easy — save it for the hard sessions.`,
      };
    }
    return {
      tone: "fast",
      line: band
        ? `Faster than ${target} — ${actual}. Strong day.`
        : `Faster than the ${target} target — ${actual}. Strong day.`,
    };
  }
  return {
    tone: "slow",
    line: band
      ? `A touch outside ${target} (${actual}). Still a deposit in the bank.`
      : `A touch off the ${target} target (${actual}). Still a deposit in the bank.`,
  };
}
