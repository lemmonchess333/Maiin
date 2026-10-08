/**
 * Post-run pace verdict — the Runna-style "how did that compare to the
 * session's target?" line on the run summary (competitive running-doc P0 #3:
 * per-session pace targets that visibly close the loop with actual
 * performance).
 *
 * Coaching-honest, adherence-neutral register (the nutrition rule applies
 * here too — never shame a slow day). The summary speaks only when a run
 * didn't match its type (Run21 (6)), so `speaks` says when:
 *  - within the tolerance band → quiet
 *  - EASY/LONG sessions run notably faster than target → one line: easy
 *    days work best slower, the mistake every coach corrects
 *  - an easy or long run slower than its window → quiet: slower is fine
 *  - a tempo quicker or easier than its pace → one line, calm either way
 *  - a race → quiet: its result says it
 * The tone is worked out either way: the run saves it, and the easier-week
 * nudge reads it.
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
import type { DistanceUnit } from "@/lib/distanceUnits";

/** ±grace (sec/km) beyond the target/band edge that still counts on-target. */
export const ON_TARGET_TOLERANCE_S = 10;

export interface PaceVerdict {
  tone: "on" | "fast" | "easy-too-fast" | "slow";
  line: string;
  /** Whether the summary shows `line`: only when the run didn't match its
   *  type (Run21 (6)). */
  speaks: boolean;
}

/** Session types where faster-than-target is a caution, not a win.
 *  Template vocabulary is "easy" | "long" (workoutTemplates.ts) — "longrun"
 *  and "recovery" are kept defensively for other callers' vocabularies.
 *  ("long" was missing pre-bands: a hot long run got "Strong day" praise
 *  instead of the easy-days-easy nudge this module documents.) */
const EASY_TYPES = new Set(["easy", "recovery", "long", "longrun"]);

/** Sessions whose pace is the point, so a run off it on either side didn't
 *  match its type. A race is not among them: its result says it. */
const WORKOUT_TYPES = new Set(["tempo", "intervals"]);

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
  /** Display unit for the paces quoted in the copy. The JUDGEMENT is
   *  unit-free — it compares sec/km to sec/km — so this only reaches the
   *  sentence, which is the point: the verdict must not change because a
   *  user reads in miles. */
  unit: DistanceUnit;
}): PaceVerdict | null {
  const { templateType, actualPaceS, targetPaceS, targetBandS, unit } = args;
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
    ? `the ${paceBandLabel(band, unit)} window`
    : paceLabel(targetPaceS, unit);
  const actual = paceLabel(actualPaceS, unit);

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
      speaks: false,
    };
  }
  const against = band ? target : `a ${target} target`;
  const workout = WORKOUT_TYPES.has(templateType);
  const session = templateType === "tempo" ? "a tempo" : "this session";
  if (diff < 0) {
    if (EASY_TYPES.has(templateType)) {
      return {
        tone: "easy-too-fast",
        line: `Faster than easy today: ${actual}, against ${against}. Easy running works best slower, so the quality sessions get your energy.`,
        speaks: true,
      };
    }
    return {
      tone: "fast",
      line: `Quicker than ${session} today: ${actual}, against ${against}. It works best held a little back, so you can keep it up for longer.`,
      speaks: workout,
    };
  }
  return {
    tone: "slow",
    line: workout
      ? `Easier than ${session} today: ${actual}, against ${against}. It still counts. Next time, aim for a few words at a time.`
      : `Slower than ${against} today: ${actual}. Slower is fine on an easy day.`,
    speaks: workout,
  };
}
