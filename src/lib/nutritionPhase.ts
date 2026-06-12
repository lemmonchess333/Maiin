import type { Goal } from "./types";

/** The phase values that drive nutrition (calorie offset + macro split). */
const VALID_PHASES: readonly Goal[] = ["cut", "lean bulk", "recomp"];

/** Minimal structural shape — accepts any profile-like object so callers don't
 *  couple to the full `UserProfile` import. */
interface ProfileWithProgram {
  program?: { goal?: string | null } | null;
}

/**
 * The SINGLE sanctioned reader of the user's nutrition phase.
 *
 * The phase lives on `profile.program.goal` — **not** `programState.goal`. Both
 * exist (`resolveProgramGoalMirror` keeps them in sync), and a prior bug
 * (`e1b0296`) shipped precisely because an editor wrote `programState.goal`
 * while every macro/calorie consumer reads `profile.program.goal`. Before this
 * accessor, ~10 sites inlined `profile?.program?.goal` with *inconsistent*
 * fallbacks (`?? "recomp"`, `?? ""`, `as Goal`, `as FitnessGoal`) — so the
 * canonical field, the default, and the enum-narrowing lived in 10 places that
 * could each drift.
 *
 * Every calorie/macro/phase consumer MUST read the phase through here. The
 * "recomp" default (maintain — 0 kcal offset) matches the dominant convention
 * and is equivalent to the old `?? ""` branch (`GOAL_CALORIE_OFFSET.recomp === 0`).
 */
export function getNutritionPhase(
  profile: ProfileWithProgram | null | undefined
): Goal {
  const g = profile?.program?.goal;
  return typeof g === "string" &&
    (VALID_PHASES as readonly string[]).includes(g)
    ? (g as Goal)
    : "recomp";
}
