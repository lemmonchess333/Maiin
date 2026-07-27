/**
 * The Program page's Run-tab header line.
 *
 * Extracted from an inline IIFE in `Program.tsx` (2026-07-27) so it can be
 * tested without mounting the page — and so the store-reconciliation bug it
 * carried could be pinned rather than just fixed.
 *
 * THE BUG. It read `runMode` from the PROFILE and `raceGoal` from the
 * `programState.runPlan` MIRROR, in one expression. `profile.raceGoal` is
 * canonical; the mirror is written later by plan regeneration. Between those
 * two writes the mode says "race_prep" while the mirror is still empty, so
 * the header rendered:
 *
 *     "Race prep · Set your race goal"
 *
 * to a user who had just set their race goal — copy that instructs someone
 * to redo work they have already done. That mixed read is verbatim the R4
 * shape `runPlanResolver`'s own header describes ("gated the overlay on
 * `runPlan.raceGoal` while mode came from `profile.runMode`").
 *
 * The fix is to take the GOAL from the resolver. Only that half was wrong:
 * `profile.runMode` is itself canonical (it is materialized from the goal),
 * so it stays. Week/target numbers stay plan-scoped too — they describe the
 * built plan and are legitimately absent until it exists, which is why the
 * distance-only line, not the prompt, is the fallback when they are missing.
 */
import { raceDistanceLabel } from "@/lib/runProgrammeViewModel";
import type { RaceGoal } from "@/features/program/runModeResolution";
import type { UserProfile } from "@/lib/auth";

export interface RunHeaderLineArgs {
  /**
   * The PROFILE's runMode, which is already canonical (it is the
   * materialized field) — this half was never the bug.
   *
   * Deliberately NOT `resolveRunPlan`'s `runMode`, and not the `RunMode`
   * type. That type is Run9a's locked two-state model
   * (`freeform | race_prep`), but `UserProfile.runMode` still admits the
   * legacy `"structured"`, and `run9Migration.migrateRunStateToRun9` is
   * pinned in KNOWN_ORPHAN_EXPORTS — never wired — so unmigrated structured
   * profiles are still out there. Narrowing to `RunMode` here would relabel
   * every one of them "Free running · Start whenever", since
   * `deriveRunMode(null)` is `freeform`. `tsc -b` caught exactly that in a
   * first pass of this change.
   */
  runMode: NonNullable<UserProfile["runMode"]>;
  /** RECONCILED — from `resolveRunPlan`, never the runPlan mirror directly. */
  raceGoal: RaceGoal | null;
  /** Plan-scoped: 0-based week index within the built plan. */
  currentWeek?: number | null;
  /** Plan-scoped: total weeks in the built plan. */
  totalWeeks?: number | null;
  /** Weekly run target, for the structured line. */
  runsTarget: number;
}

export function runHeaderLine({
  runMode,
  raceGoal,
  currentWeek,
  totalWeeks,
  runsTarget,
}: RunHeaderLineArgs): string {
  if (runMode === "race_prep") {
    // Reachable only when the user genuinely has no goal — mode is race_prep
    // but nothing is set anywhere. With the reconciled goal this is a real
    // "go set one" prompt rather than a regeneration-window artefact.
    if (!raceGoal) return "Race prep · Set your race goal";
    const dist = raceDistanceLabel(raceGoal.distance);
    // Week counts come from the PLAN, so they are absent in exactly the
    // window the bug used to mangle. Falling back to the distance-only line
    // is the honest reading: the race is known, the plan is not built yet.
    if (currentWeek != null && totalWeeks) {
      return `Race prep · ${dist} · Week ${currentWeek + 1}/${totalWeeks}`;
    }
    return `Race prep · ${dist}`;
  }
  if (runMode === "structured") {
    return `Structured · ${runsTarget} ${runsTarget === 1 ? "run" : "runs"}/week`;
  }
  return "Free running · Start whenever";
}
