import type { ActivityType } from '@/types/run';

export const MIN_RUN_DURATION_SECONDS = 30;
export const MIN_OUTDOOR_DISTANCE_KM = 0.05;
export const MIN_TREADMILL_DISTANCE_KM = 0.05;
/** Manual entry (the "Track without GPS" path) — same floor as
 *  treadmill since both flow through TreadmillMode's manual input. */
export const MIN_MANUAL_DISTANCE_KM = 0.05;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Treadmill and manual runs both bypass GPS — treadmill because the
 *  user is on a fixed surface, manual because GPS never locked
 *  outdoors. Undefined activityType (legacy / mid-config flow) is
 *  treated as outdoor: that's what the original `!== 'treadmill'`
 *  inline checks resolved to. */
export function isOutdoorGpsRun(activityType: ActivityType | undefined): boolean {
  return activityType !== 'treadmill' && activityType !== 'manual';
}

/** Both treadmill and manual flows take a manual distance entry via
 *  TreadmillMode's input. */
export function requiresManualDistance(activityType: ActivityType | undefined): boolean {
  return activityType === 'treadmill' || activityType === 'manual';
}

export function isInvalidRun(args: {
  activityType: ActivityType;
  distanceKm: number;
  elapsedSeconds: number;
}): boolean {
  if (requiresManualDistance(args.activityType)) {
    /* Manual / treadmill: distance floor only. We trust the user's
       entry up to 50m since the elapsed timer started when they tapped
       Start; a brisk warmup of 100m / 0:30 is a real run. The outdoor
       elapsed-time floor catches "accidental tap then immediately
       Stop" cases that don't apply here. */
    const min = args.activityType === 'treadmill'
      ? MIN_TREADMILL_DISTANCE_KM
      : MIN_MANUAL_DISTANCE_KM;
    return args.distanceKm < min;
  }
  return args.elapsedSeconds < MIN_RUN_DURATION_SECONDS || args.distanceKm < MIN_OUTDOOR_DISTANCE_KM;
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
