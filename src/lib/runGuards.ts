import type { ActivityType } from '@/types/run';

export const MIN_RUN_DURATION_SECONDS = 30;
export const MIN_OUTDOOR_DISTANCE_KM = 0.05;
export const MIN_TREADMILL_DISTANCE_KM = 0.05;
/** Manual entry (the "Track without GPS" path) — same floor as
 *  treadmill since both flow through TreadmillMode's manual input. */
export const MIN_MANUAL_DISTANCE_KM = 0.05;

/**
 * Maximum plausible aggregate speed for a recorded run. Matches the
 * 12 m/s per-fix threshold in `src/lib/gps.ts` `isValidReading()`,
 * which has been the convention there for outdoor GPS validation.
 *
 * 12 m/s ≈ 43 km/h ≈ 1:23/km — comfortably above any sustained human
 * pace including elite sprinters (Bolt's 100m WR is ~10 m/s peak,
 * never sustained).
 *
 * Used to catch manual-entry typos on TreadmillMode's distance input
 * (e.g. typing `20` instead of `2.0`) before they save as 20km / 0:08
 * runs that pollute weekly km totals + the activity feed.
 */
export const MAX_PLAUSIBLE_SPEED_MS = 12;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** The specific reason a run is invalid, drives the InvalidRunReview
 *  body copy so the user sees an explanation that matches the actual
 *  failure mode instead of a generic "too short" message. */
export type InvalidRunReason = 'too-short' | 'too-fast';

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

/**
 * Returns the reason a run should be flagged as invalid, or null if
 * the run is fine. Centralises the validity logic so both
 * `isInvalidRun` (which drives routing) and the `InvalidRunReview`
 * body copy (which drives explanation) read from the same source.
 *
 * Order matters: `'too-fast'` is checked first because it's the more
 * specific failure mode. A 20km / 0:08 treadmill entry triggers BOTH
 * speed AND distance predicates depending on inputs — calling it
 * "too short" would be technically true in some cases but useless to
 * the user, who actually fat-fingered the distance.
 *
 * Per-mode rules:
 *   outdoor    → distance < MIN_OUTDOOR OR elapsed < MIN_DURATION
 *   treadmill  → distance < MIN_TREADMILL (no elapsed floor — manual
 *                entry, brief warmups are real runs)
 *   manual     → distance < MIN_MANUAL (same as treadmill)
 *
 * Plus an aggregate-speed check on manual-distance modes only (outdoor
 * is bounded by `isValidReading`'s per-fix filter at the same 12 m/s
 * threshold).
 */
export function getInvalidRunReason(args: {
  activityType: ActivityType;
  distanceKm: number;
  elapsedSeconds: number;
}): InvalidRunReason | null {
  if (requiresManualDistance(args.activityType)) {
    /* Pace-sanity first — catches the "20 instead of 2.0" typo
       case. */
    if (args.elapsedSeconds > 0) {
      const impliedSpeedMS = (args.distanceKm * 1000) / args.elapsedSeconds;
      if (impliedSpeedMS > MAX_PLAUSIBLE_SPEED_MS) return 'too-fast';
    }
    /* Distance floor — manual / treadmill don't apply the outdoor
       elapsed-time floor because a 100m / 0:30 treadmill warmup is a
       legitimate save. */
    const min = args.activityType === 'treadmill'
      ? MIN_TREADMILL_DISTANCE_KM
      : MIN_MANUAL_DISTANCE_KM;
    if (args.distanceKm < min) return 'too-short';
    return null;
  }

  /* Outdoor: both floors apply. The accidental "tap Start, tap Stop"
     case needs the elapsed gate; an opening-pace burst before GPS
     locks needs the distance gate. */
  if (args.elapsedSeconds < MIN_RUN_DURATION_SECONDS) return 'too-short';
  if (args.distanceKm < MIN_OUTDOOR_DISTANCE_KM) return 'too-short';
  return null;
}

export function isInvalidRun(args: {
  activityType: ActivityType;
  distanceKm: number;
  elapsedSeconds: number;
}): boolean {
  return getInvalidRunReason(args) !== null;
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
