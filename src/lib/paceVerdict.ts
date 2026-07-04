/**
 * Post-run pace verdict — the Runna-style "how did that compare to the
 * session's target?" line on the run summary (competitive running-doc P0 #3:
 * per-session pace targets that visibly close the loop with actual
 * performance).
 *
 * Coaching-honest, adherence-neutral register (the nutrition rule applies
 * here too — never shame a slow day):
 *  - within the tolerance band → on-target praise
 *  - EASY/RECOVERY sessions run notably faster than target get a gentle
 *    "easy days easy" nudge, NOT praise — the mistake every coach corrects
 *  - hard sessions run faster → strong day
 *  - slower → calm, no-drama framing
 *
 * Pure: the caller resolves the target (resolveSessionPaces) and passes
 * seconds/km; this module only decides tone + copy.
 */

import { paceLabel } from "@/lib/runLabels";

/** ±band (sec/km) inside which a run counts as on-target. */
export const ON_TARGET_TOLERANCE_S = 10;

export interface PaceVerdict {
  tone: "on" | "fast" | "easy-too-fast" | "slow";
  line: string;
}

/** Session types where faster-than-target is a caution, not a win. */
const EASY_TYPES = new Set(["easy", "recovery", "longrun"]);

export function resolvePaceVerdict(args: {
  /** Session template type (easy / tempo / intervals / longrun / race …). */
  templateType: string;
  /** Actual average pace, sec/km. */
  actualPaceS: number;
  /** Resolved target pace for the session, sec/km. */
  targetPaceS: number;
}): PaceVerdict | null {
  const { templateType, actualPaceS, targetPaceS } = args;
  if (
    !Number.isFinite(actualPaceS) ||
    !Number.isFinite(targetPaceS) ||
    actualPaceS <= 0 ||
    targetPaceS <= 0
  ) {
    return null;
  }

  const target = paceLabel(targetPaceS);
  const actual = paceLabel(actualPaceS);
  const diff = actualPaceS - targetPaceS; // positive = slower than target

  if (Math.abs(diff) <= ON_TARGET_TOLERANCE_S) {
    return {
      tone: "on",
      line: `Right on target — ${actual} against a ${target} goal.`,
    };
  }
  if (diff < 0) {
    if (EASY_TYPES.has(templateType)) {
      return {
        tone: "easy-too-fast",
        line: `Quicker than the ${target} easy target (${actual}). Keep the easy days easy — save it for the hard sessions.`,
      };
    }
    return {
      tone: "fast",
      line: `Faster than the ${target} target — ${actual}. Strong day.`,
    };
  }
  return {
    tone: "slow",
    line: `A touch off the ${target} target (${actual}). Still a deposit in the bank.`,
  };
}
