import type { FitnessGoal } from "@/lib/tdee";

/**
 * The nutrition phase (cut / recomp / lean bulk) is a MIRRORED field: the
 * canonical build path (`planBuilder.buildPlan`) writes the SAME derived phase
 * to BOTH `profile.program.goal` AND `programState.goal` in one operation.
 * Macro/calorie consumers read the profile copy; the lift engine reads the
 * programState copy — `useProgram.logExercise` passes `programState.goal` into
 * `applyProgression` (rep-scheme selection), `Program.tsx` shows it in the
 * header, and `regenerateProgram` prefers it over the profile value. When the
 * SettingsNutrition page persists a derived-phase change it must mirror BOTH
 * copies, or the lift side keeps the stale goal's rep scheme (the repo's
 * "persist every mirrored and derived field in the same write" rule).
 *
 * Pgm5 boundary: mirroring `programState.goal` does NOT restructure the plan or
 * touch `workouts` — it only updates the scalar the engine reads for FUTURE
 * progression, which is exactly Pgm5's "the engine adapts but never silently
 * discards a user decision" (a Reset is still the path to a full rebuild).
 *
 * Returns the value to write, or `null` when no mirror write is needed
 * (programState absent — cold-start, no plan yet to keep in sync — or the
 * stored goal already equals the derived phase). Exported for unit testing.
 */
export function resolveProgramGoalMirror(
  derivedPhase: FitnessGoal,
  storedProgramGoal: FitnessGoal | null | undefined
): FitnessGoal | null {
  // No programState doc / no goal yet → nothing to keep in sync. Writing a
  // partial `{ goal }` merge here would manufacture a malformed programState
  // (no workouts/runDays/schemaVersion); the canonical buildPlan path owns
  // first-time creation.
  if (storedProgramGoal == null) return null;
  if (storedProgramGoal === derivedPhase) return null;
  return derivedPhase;
}
