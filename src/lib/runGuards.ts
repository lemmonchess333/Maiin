import type { ActivityType } from '@/types/run';

export const MIN_RUN_DURATION_SECONDS = 30;
export const MIN_OUTDOOR_DISTANCE_KM = 0.05;
export const MIN_TREADMILL_DISTANCE_KM = 0.05;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function isOutdoorGpsRun(activityType: ActivityType): boolean {
  return activityType !== 'treadmill';
}

export function requiresManualDistance(activityType: ActivityType): boolean {
  return activityType === 'treadmill';
}

export function isInvalidRun(args: {
  activityType: ActivityType;
  distanceKm: number;
  elapsedSeconds: number;
}): boolean {
  const minDistanceKm = isOutdoorGpsRun(args.activityType)
    ? MIN_OUTDOOR_DISTANCE_KM
    : MIN_TREADMILL_DISTANCE_KM;
  return args.elapsedSeconds < MIN_RUN_DURATION_SECONDS || args.distanceKm < minDistanceKm;
}

export function canShowFullSummary(args: { isInvalid: boolean }): boolean {
  return !args.isInvalid;
}

// Save Run button: visible for valid runs in idle or saving state.
export function canShowNormalSave(args: { isInvalid: boolean; saveStatus: SaveStatus }): boolean {
  return !args.isInvalid && (args.saveStatus === 'idle' || args.saveStatus === 'saving');
}

// Save anyway button: visible for invalid runs in idle or saving state.
export function canShowSaveAnyway(args: { isInvalid: boolean; saveStatus: SaveStatus }): boolean {
  return args.isInvalid && (args.saveStatus === 'idle' || args.saveStatus === 'saving');
}

// Discard button: visible only in idle or error. Hidden during saving (race prevention) and after saved.
export function canShowDiscard(args: { saveStatus: SaveStatus }): boolean {
  return args.saveStatus === 'idle' || args.saveStatus === 'error';
}

// Share: only valid + saved runs.
export function canShowShare(args: { isInvalid: boolean; saveStatus: SaveStatus }): boolean {
  return !args.isInvalid && args.saveStatus === 'saved';
}

// Export GPX: only valid + saved + outdoor GPS runs (treadmill/manual has no route).
export function canExportGpx(args: {
  isInvalid: boolean;
  isOutdoorGpsRun: boolean;
  saveStatus: SaveStatus;
}): boolean {
  return !args.isInvalid && args.isOutdoorGpsRun && args.saveStatus === 'saved';
}

// Done: only after successful save.
export function canShowDone(args: { saveStatus: SaveStatus }): boolean {
  return args.saveStatus === 'saved';
}

// Retry banner: only on error.
export function canShowRetrySave(args: { saveStatus: SaveStatus }): boolean {
  return args.saveStatus === 'error';
}
