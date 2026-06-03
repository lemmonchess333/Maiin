/**
 * Onboarding run-mode resolution (#975 — race-date optional).
 *
 * Pure + tiny so the "race_prep selected but no date → freeform substrate"
 * rule is unit-testable and lives in ONE place (both save sites in
 * Onboarding.tsx call this, never re-deriving the branch inline).
 *
 * Run9a locked model: the run surface is two states only — a freeform
 * substrate + an optional race-goal overlay. A race_prep selection WITHOUT a
 * target date is therefore not a broken/empty race plan; it lands on the
 * freeform substrate (a valid Run9a state). The richer place to set a date
 * is the Race Goal Planner on the Programme/Training surface, which gives
 * runway feedback the bare onboarding date field can't.
 *
 * No "structured" coercion here — structured is passed through untouched
 * (this helper only governs the race_prep-without-date case).
 */
export type OnboardingRunMode = "freeform" | "structured" | "race_prep";

export function resolveOnboardingRunMode(input: {
  runFrequency: string;
  runMode: OnboardingRunMode;
  hasRaceDate: boolean;
}): OnboardingRunMode {
  const { runFrequency, runMode, hasRaceDate } = input;
  // No running at all → always the freeform substrate.
  if (runFrequency === "none") return "freeform";
  // Race intent without a date → freeform substrate (Run9a), never a
  // dangling race_prep with no raceGoal.
  if (runMode === "race_prep" && !hasRaceDate) return "freeform";
  return runMode;
}
