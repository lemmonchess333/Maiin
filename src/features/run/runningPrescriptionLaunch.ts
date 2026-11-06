import type { RunConfig } from "@/components/run/runConfigDefaults";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";
import { isTreadmillRun, requiresManualDistance } from "@/lib/runGuards";

/** User-chosen recording remains available without a prescription. Removing a
 * plan link is intentional: unprescribed activity must not claim an old slot. */
export function withoutRunningPrescription(config: RunConfig): RunConfig {
  return {
    ...config,
    canonicalLaunch: undefined,
    legacyPlanClaimExcluded: true,
    activityType:
      requiresManualDistance(config) && !isTreadmillRun(config)
        ? "manual"
        : "freerun",
    ...(isTreadmillRun(config) ? { place: "treadmill" as const } : {}),
    target: { type: "none" },
    paceAlerts: false,
    segments: undefined,
    intervals: undefined,
    guidedWorkout: undefined,
    planMetadata: freeformPlanMetadata("freeform"),
  };
}

/** Recheck at the actual start boundary, including after awaited setup. */
export function isUnprescribedRun(config: RunConfig): boolean {
  return (
    !config.canonicalLaunch &&
    ["freerun", "manual", "treadmill"].includes(config.activityType) &&
    config.target.type === "none" &&
    !config.paceAlerts &&
    !config.segments?.length &&
    !config.intervals &&
    !config.guidedWorkout &&
    config.planMetadata.planMode === "freeform" &&
    config.planMetadata.planSource === "manual" &&
    config.planMetadata.plannedRunDayIndex === null &&
    config.planMetadata.plannedTemplateType === null &&
    !config.planMetadata.scheduledRunId &&
    !config.planMetadata.actualTemplateId &&
    !config.planMetadata.plannedTemplateId
  );
}
