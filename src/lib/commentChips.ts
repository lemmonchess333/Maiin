/**
 * The quick replies offered under a session's comments: the person's own
 * voice to a friend, so "Nice run" keeps its register (CODING_STANDARDS'
 * genre exceptions). The feed's comment sheet and the post's own page
 * offer the same ones.
 */
const RUN_CHIPS = ["Nice run", "Great pace", "Keep it up"];
const LIFT_CHIPS = ["Great lift", "Solid session", "Strong work"];

export function commentQuickChips(type: string | undefined): string[] {
  return type === "run" ? RUN_CHIPS : LIFT_CHIPS;
}
