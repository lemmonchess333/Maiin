/**
 * Run9 phase 2 — the Programme Run tab's single contextual-prompt slot.
 *
 * The pre-Run9 surface stacked up to six independent amber/blue banners
 * (race-elapsed, compressed, no-show, recovery-complete, recovery, malformed)
 * that could all render at once. Run9b collapses that to ONE slot, and the
 * round-2/3 stress-tests pinned exactly what may occupy it.
 *
 * Lock (k) BANNER/HERO TAXONOMY — split two kinds of content:
 *   - PERSISTENT plan attributes (compressed note, taper line, "Week N of M")
 *     live in the RACE HEADER, always visible. They are NOT prompts and never
 *     compete for this slot. (This module deliberately does NOT return them.)
 *   - ONE-AT-A-TIME actionable prompts share this single slot.
 *
 * Lock (f) + (k) PRECEDENCE for simultaneous actionable prompts:
 *   no-show  >  recovery-complete  >  fell-behind
 * Round-2 fixed the round-1 ordering that buried an actionable fell-behind
 * under the (informational) compressed note — compressed is no longer in the
 * slot at all, so that inversion can't recur.
 *
 * Recovery IN-PROGRESS is NOT here: it's a hero state ("race-recovery" in
 * runHeroState), not a transient prompt. Only recovery-COMPLETE (the window
 * elapsed, awaiting the user's "set next race / done" action) is a slot prompt.
 *
 * Pure: the caller derives the booleans from programState + today; this returns
 * which prompt (if any) wins. The component maps the result to copy + action.
 */

export type RunContextualPrompt =
  /** Race date passed with no logged race — `raceDayStatus === "race_no_show"`. */
  | "no-show"
  /** Recovery window elapsed (phase=recovery AND today >= recoveryEndDate),
   *  awaiting the user's exit action. */
  | "recovery-complete"
  /** `programState.pendingFellBehindPrompt` set by the weekly server check. */
  | "fell-behind";

export interface RunContextualPromptInput {
  isNoShow: boolean;
  recoveryEnded: boolean;
  pendingFellBehind: boolean;
}

/**
 * Returns the single highest-precedence actionable prompt, or `null` when the
 * slot is empty. Precedence: no-show > recovery-complete > fell-behind.
 */
export function resolveRunContextualPrompt(
  input: RunContextualPromptInput
): RunContextualPrompt | null {
  if (input.isNoShow) return "no-show";
  if (input.recoveryEnded) return "recovery-complete";
  if (input.pendingFellBehind) return "fell-behind";
  return null;
}
