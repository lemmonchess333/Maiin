/**
 * Programme-context strip for the run set-up sheet — the read-only line
 * that tells a runner what their plan says about today ("Week 3 of 8 ·
 * 10K", "Rest day", "Tempo Run") above the run-type chooser.
 *
 * Pure: takes the plan metadata the run page has already resolved plus the
 * runPlan sub-object, returns the strip to render or null. Lived inline in
 * pages/Run.tsx until 2026-09; moved here so the branching is unit-tested
 * and the page stays a page (ADR-0001).
 */
import { RUN_TEMPLATES } from "./workoutTemplates";
import { localDateString } from "./dateHelpers";
import { formatRaceDistance } from "./runLabels";
import type { RunPlanMetadata } from "./runPlanMetadata";

/**
 * Read-only programme context strip data, computed in Run.tsx from
 * useProgram + URL params. Drives the strip rendered above the
 * selected-run card. Null = no strip (freeform user, or programme
 * has no opinion on today).
 *
 * Six visible states:
 *   - race_prep today_plan         → "Race prep · Week N of M · {distance}"
 *   - structured today_plan        → "This week's plan · {todayLabel}"
 *   - race_prep / structured rest_day      → "Rest day in your plan."
 *   - race_prep / structured completed_day → completed-day copy
 *   - race_prep elapsed            → "Race prep ended" + Settings link
 *   - freeform / no plan           → strip not rendered (null)
 */
export interface ProgramContextStrip {
  kind:
    | "race_prep_today"
    | "structured_today"
    | "rest_day"
    | "completed_day"
    | "race_prep_elapsed";
  /** For race_prep today: "Week 3 of 8" */
  weekLabel?: string;
  /** For race_prep today: "10K" / "Half Marathon" etc. */
  distanceLabel?: string;
  /** For race_prep today: ISO target date, rendered as a secondary line. */
  targetDate?: string;
  /** For structured today: "Tempo Run" / "Easy 30" — the day's template name. */
  todayLabel?: string;
}

/**
 * Map the metadata returned by computePlanMetadata into the
 * ProgramContextStrip shape consumed by RunSetupModal. Kept local
 * to Run.tsx because the strip-data fields are presentation-level
 * (week label, distance label, today template name) — the metadata
 * module stays purely about adherence accounting.
 *
 * Returns null when no strip should render (freeform users with
 * no plan context, missing-template fallback, or an elapsed plan
 * that the metadata module already folded into freeform metadata).
 */
export function deriveStrip(
  metadata: RunPlanMetadata,
  runPlan:
    | {
        mode: "structured" | "race_prep";
        raceGoal?: { distance: string; targetDate: string };
        totalWeeks?: number;
        currentWeek?: number;
      }
    | undefined
): ProgramContextStrip | null {
  // Freeform / fallback cases get no strip.
  if (metadata.planMode === "freeform") return null;
  // Race-prep elapsed: metadata module already returned the freeform
  // shape, but planMode === 'race_prep' is preserved. The trigger
  // for the elapsed-state strip: we still have an elapsed runPlan
  // even though planSource is 'manual'.
  if (
    metadata.planMode === "race_prep" &&
    metadata.planSource === "manual" &&
    runPlan?.mode === "race_prep"
  ) {
    const elapsed =
      (typeof runPlan.currentWeek === "number" &&
        typeof runPlan.totalWeeks === "number" &&
        runPlan.currentWeek >= runPlan.totalWeeks) ||
      // Local date-string compare: elapsed only AFTER race day, not during it
      // (UTC-midnight parse dropped the race template to freeform on race day
      // for non-UTC users). Matches isRacePlanElapsed in runPlanMetadata.ts.
      (!!runPlan.raceGoal?.targetDate &&
        localDateString() > runPlan.raceGoal.targetDate);
    if (elapsed) {
      return { kind: "race_prep_elapsed" };
    }
  }
  if (metadata.planSource === "rest_day") return { kind: "rest_day" };
  if (metadata.planSource === "completed_day") return { kind: "completed_day" };
  if (
    metadata.planSource === "today_plan" ||
    metadata.planSource === "url_template"
  ) {
    // For URL-template overrides on a freeform user, no strip
    // (no plan context to surface). For URL-template on a
    // structured/race_prep user with a planned day, fall through
    // to the planned-day strip — the user is overriding their plan
    // and we still surface the plan context.
    if (metadata.planMode === "race_prep") {
      // Need a planned day or runPlan to render this state.
      if (
        metadata.plannedRunDayIndex === null &&
        metadata.planSource === "url_template"
      ) {
        return null; // no plan today and URL is the only context
      }
      return {
        kind: "race_prep_today",
        weekLabel:
          typeof metadata.planWeekIndex === "number" &&
          typeof metadata.planTotalWeeks === "number"
            ? `Week ${metadata.planWeekIndex + 1} of ${metadata.planTotalWeeks}`
            : "",
        distanceLabel: formatRaceDistance(runPlan?.raceGoal?.distance),
        targetDate: runPlan?.raceGoal?.targetDate,
      };
    }
    if (metadata.planMode === "structured") {
      if (
        metadata.plannedRunDayIndex === null &&
        metadata.planSource === "url_template"
      ) {
        return null;
      }
      const todayTemplate = RUN_TEMPLATES.find(
        (t) => t.id === metadata.plannedTemplateId
      );
      return {
        kind: "structured_today",
        todayLabel: todayTemplate?.name,
      };
    }
  }
  return null;
}
