/**
 * Derived UI guards for the run flow. Pure functions over the existing
 * state model (`runConfig.activityType`, `phase`, distance, elapsed,
 * save status). No new state — these are computed at render time and
 * make rendering decisions explicit at the call site rather than
 * scattered across nested ternaries.
 *
 * Reserved for run-flow rendering decisions only. If a guard is needed
 * elsewhere (e.g. Programme page picking a run target), prefer
 * lifting it to a shared module rather than expanding this file.
 */

import type { ActivityType } from "@/components/run/RunSetupModal";

type ActivityTypeOrNullish = ActivityType | null | undefined;

/** Treadmill is the only mode that doesn't depend on GPS. Guided runs
 *  and intervals still record outdoors. */
export function isOutdoorGpsRun(activityType: ActivityTypeOrNullish): boolean {
  return activityType !== "treadmill";
}

/** Treadmill flow takes a manual distance entry instead of accumulating
 *  from GPS fixes. */
export function requiresManualDistance(activityType: ActivityTypeOrNullish): boolean {
  return activityType === "treadmill";
}

interface InvalidRunInput {
  distanceMeters: number;
  elapsedSeconds: number;
  activityType: ActivityTypeOrNullish;
}

/**
 * Outdoor: under 100m OR under 30s — almost certainly an accidental
 * start, an aborted run, or a GPS-never-locked recording. The
 * 0.00km / 14s screenshot the user reported lands cleanly here.
 *
 * Treadmill: under 50m — manual entry, we trust the user up to a small
 * floor that catches "tap the wrong button by accident" cases.
 */
export function isInvalidRun({ distanceMeters, elapsedSeconds, activityType }: InvalidRunInput): boolean {
  if (requiresManualDistance(activityType)) {
    return distanceMeters < 50;
  }
  return distanceMeters < 100 || elapsedSeconds < 30;
}

interface SummaryGuardInput {
  isInvalid: boolean;
  saved: boolean;
}

/**
 * Full summary = stats grid AND map AND splits AND elevation AND share.
 * For invalid runs that the user explicitly chose to "Save anyway" we
 * unblock the full surface — the data is what it is, but they own it.
 */
export function canShowFullSummary({ isInvalid, saved }: SummaryGuardInput): boolean {
  return !isInvalid || saved;
}

/** Share to feed makes no sense for a 0km run. Hide outright on invalid. */
export function canShowShare({ isInvalid }: { isInvalid: boolean }): boolean {
  return !isInvalid;
}

/** GPX export is meaningless without points. Hide on invalid AND on
 *  any treadmill run (no GPS track to export regardless of validity). */
export function canExportGpx({
  isInvalid,
  activityType,
}: {
  isInvalid: boolean;
  activityType: ActivityTypeOrNullish;
}): boolean {
  if (!isOutdoorGpsRun(activityType)) return false;
  return !isInvalid;
}

interface SaveGuardInput {
  status: "idle" | "saving" | "saved" | "error";
}

export function canShowRetrySave({ status }: SaveGuardInput): boolean {
  return status === "error";
}
