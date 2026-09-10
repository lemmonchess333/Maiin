import type { ActivityType } from "@/types/run";

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

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** The specific reason a run is invalid, drives the InvalidRunReview
 *  body copy so the user sees an explanation that matches the actual
 *  failure mode instead of a generic "too short" message. */
export type InvalidRunReason = "too-short" | "too-fast";

/** Treadmill and manual runs both bypass GPS — treadmill because the
 *  user is on a fixed surface, manual because GPS never locked
 *  outdoors. Undefined activityType (legacy / mid-config flow) is
 *  treated as outdoor: that's what the original `!== 'treadmill'`
 *  inline checks resolved to. */
export function isOutdoorGpsRun(
  activityType: ActivityType | undefined
): boolean {
  return activityType !== "treadmill" && activityType !== "manual";
}

/** Both treadmill and manual flows take a manual distance entry via
 *  TreadmillMode's input. */
export function requiresManualDistance(
  activityType: ActivityType | undefined
): boolean {
  return activityType === "treadmill" || activityType === "manual";
}

/**
 * Returns the reason a run should be flagged as invalid, or null if
 * the run is fine. THE validity predicate: routing (Run.tsx,
 * RunSummary.tsx) and the `InvalidRunReview` body copy both read the
 * reason from here, so the decision and its explanation cannot drift.
 *
 * A boolean `isInvalidRun` wrapper used to sit alongside this and was
 * what routing called. Both call sites moved to the reason itself —
 * they need to know WHICH failure to explain — leaving the wrapper
 * dead. Removed 2026-07-27. Callers wanting a boolean should compare
 * to null at the call site rather than reintroduce a second predicate.
 *
 * Uniform contract: a run is invalid if `elapsedSeconds < 30` OR
 * `distanceKm < 0.05`, applied to all activity types. For
 * user-entered distance (treadmill / manual) elapsed time is the only
 * measured signal — the floor is what catches accidental taps and
 * misclicks, exactly as it does for outdoor.
 *
 * Order matters: `'too-fast'` is checked first because it's the more
 * specific failure mode. A 20km / 0:08 treadmill entry triggers BOTH
 * the speed and the duration predicates — calling it "too short" is
 * technically true but useless to the user, who actually fat-fingered
 * the distance.
 *
 * The pace-sanity check applies only to manual-distance modes;
 * outdoor's per-fix 12 m/s filter in `isValidReading()` (gps.ts) keeps
 * the aggregate from ever reaching the threshold legitimately, so a
 * second check would be redundant.
 *
 * `elapsedSeconds === 0` skips the divide and falls through to the
 * elapsed-time floor — returns 'too-short' rather than throwing.
 */
export function getInvalidRunReason(args: {
  activityType: ActivityType;
  distanceKm: number;
  elapsedSeconds: number;
}): InvalidRunReason | null {
  if (requiresManualDistance(args.activityType) && args.elapsedSeconds > 0) {
    const impliedSpeedMS = (args.distanceKm * 1000) / args.elapsedSeconds;
    if (impliedSpeedMS > MAX_PLAUSIBLE_SPEED_MS) return "too-fast";
  }
  if (args.elapsedSeconds < MIN_RUN_DURATION_SECONDS) return "too-short";
  const minDistance = requiresManualDistance(args.activityType)
    ? args.activityType === "treadmill"
      ? MIN_TREADMILL_DISTANCE_KM
      : MIN_MANUAL_DISTANCE_KM
    : MIN_OUTDOOR_DISTANCE_KM;
  if (args.distanceKm < minDistance) return "too-short";
  return null;
}

// Save run button: visible for valid runs in idle or saving state.
export function canShowNormalSave(args: {
  isInvalid: boolean;
  saveStatus: SaveStatus;
}): boolean {
  return (
    !args.isInvalid &&
    (args.saveStatus === "idle" || args.saveStatus === "saving")
  );
}

// Save anyway button: visible for invalid runs in idle or saving state.
export function canShowSaveAnyway(args: {
  isInvalid: boolean;
  saveStatus: SaveStatus;
}): boolean {
  return (
    args.isInvalid &&
    (args.saveStatus === "idle" || args.saveStatus === "saving")
  );
}

// Discard button: visible only in idle or error. Hidden during saving (race prevention) and after saved.
export function canShowDiscard(args: { saveStatus: SaveStatus }): boolean {
  return args.saveStatus === "idle" || args.saveStatus === "error";
}

// Share: only valid + saved runs.
export function canShowShare(args: {
  isInvalid: boolean;
  saveStatus: SaveStatus;
}): boolean {
  return !args.isInvalid && args.saveStatus === "saved";
}

// Export GPX: only valid + saved + outdoor GPS runs (treadmill/manual has no route).
export function canExportGpx(args: {
  isInvalid: boolean;
  isOutdoorGpsRun: boolean;
  saveStatus: SaveStatus;
}): boolean {
  return !args.isInvalid && args.isOutdoorGpsRun && args.saveStatus === "saved";
}

// Done: only after successful save.
export function canShowDone(args: { saveStatus: SaveStatus }): boolean {
  return args.saveStatus === "saved";
}

// Retry banner: only on error.
export function canShowRetrySave(args: { saveStatus: SaveStatus }): boolean {
  return args.saveStatus === "error";
}

/**
 * The summary's hero heading, for a run too small to earn celebratory copy.
 *
 * "Run saved" is a claim about the WRITE. This decided it from the distance
 * alone, so any short run with a non-zero distance greeted the user with
 * "Run saved" the moment the summary opened — above the Save button that
 * had not been tapped. "Run recorded" is true from the moment the run ends
 * and stays true either way, which is why it is the pre-save wording rather
 * than something hedged.
 */
export function unsizedRunHeading(args: { saveStatus: SaveStatus }): string {
  return args.saveStatus === "saved" ? "Run saved" : "Run recorded";
}

/**
 * Has the user edited the post-save fields since the run was written?
 *
 * Notes and effort stay editable after saving, but the Save button is gone
 * by then and Done only navigates — so a correction typed at that point was
 * silently dropped. `saved` is null before the write: there is nothing to
 * update yet, and the ordinary Save button is still on screen.
 *
 * Notes compare TRIMMED, because that is the form that was written; adding
 * a trailing space is not an edit worth offering to save.
 */
export function hasUnsavedFieldEdits(args: {
  saved: { notes: string; relativeEffort: string | null } | null;
  notes: string;
  relativeEffort: string | null;
}): boolean {
  if (!args.saved) return false;
  return (
    args.saved.notes !== args.notes.trim() ||
    args.saved.relativeEffort !== args.relativeEffort
  );
}
