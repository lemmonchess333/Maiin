import type { ProgramState } from "@/features/program/programTypes";

/**
 * How many runs the active deload actually stepped down.
 *
 * The deload banner's active state describes what changed, and since the
 * deload grew a run half (#1930) it has been describing only the lift
 * side — "one set fewer and slightly lower targets, at the same weights"
 * — while an athlete's Tuesday tempo had quietly become a shorter one.
 * The applied rule is explicit that a reduction must "state whether sets,
 * reps, load, exercise stress, or schedule changed"; the run swap is a
 * change to exercise stress that nothing said out loud.
 *
 * Derived by comparing the pre-deload snapshot against the live week
 * rather than stored, for two reasons. A stored count would be a second
 * thing to keep in step with a week that `moveRunDay`, `transitionRunDay`
 * and the ease week all mutate. And deriving makes the number
 * self-correcting across the two deload paths, which genuinely differ:
 *
 *   - the user-applied deload sends `runSwaps`, so days differ and the
 *     count is real;
 *   - the AUTOMATIC week-4 deload runs through `advanceWeek`, which is
 *     lift-only (`programEngine.ts` contains no `runDays` reference at
 *     all) — runs are regenerated at full prescription by the rollover.
 *     No snapshot, no difference, count 0, and the copy correctly says nothing
 *     about running.
 *
 * So the copy ends up telling the truth about whichever deload the
 * athlete is actually in, instead of one sentence pretending both are
 * the same.
 */
export function deloadRunSwapCount(
  state:
    | Pick<ProgramState, "runDays" | "deloadSnapshot" | "weekNumber">
    | null
    | undefined
): number {
  if (!state) return 0;
  const snap = state.deloadSnapshot;
  // Scoped to this week, like every other read of the snapshot: one
  // stranded by a rollover describes a week the athlete has left.
  if (!snap || snap.weekNumber !== state.weekNumber) return 0;
  const before = snap.runDays;
  const now = state.runDays;
  if (!Array.isArray(before) || !Array.isArray(now)) return 0;

  const key = (rd: { id?: string; dayIndex?: number }) =>
    rd.id != null ? String(rd.id) : String(rd.dayIndex);
  const wasById = new Map(before.map((rd) => [key(rd), rd]));
  let changed = 0;
  for (const rd of now) {
    const was = wasById.get(key(rd));
    if (was && was.templateId !== rd.templateId) changed += 1;
  }
  return changed;
}
