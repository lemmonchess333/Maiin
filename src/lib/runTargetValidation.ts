import type { ActivityType } from '@/types/run';

/**
 * Pre-flight validation for run setup targets. Returns a
 * user-facing error string when the configured target is below
 * (or above) sane bounds, or `null` when the target is fine.
 *
 * Covers the gap between the existing onBlur clamping in
 * RunSetupModal (which only fires when the input loses focus) and
 * the case where the user types a sub-threshold value and taps
 * Start before blur. The Start button reads this error and
 * disables when non-null so a 0.005km / 0:30 / 0:30/km target
 * can't ship.
 *
 * Bounds:
 *   distance — 0.5km .. 100km
 *   time     — 1 min  .. 5 h
 *   pace     — 2:00   .. 15:00 /km  (elite marathon ~2:50/km;
 *              slow walk ~15:00/km — anything outside is a typo)
 *
 * Skip cases:
 *   target.type === 'none'           — no target, nothing to check
 *   activityType === 'intervals'     — interval config has its own
 *                                       work/rest fields
 *   activityType === 'treadmill'     — target inputs aren't shown
 */

export interface RunTargetConfigSlice {
  activityType: ActivityType;
  target: { type: 'none' | 'distance' | 'time' | 'pace'; value?: number };
}

export const TARGET_DISTANCE_MIN_M = 500;
export const TARGET_DISTANCE_MAX_M = 100_000;
export const TARGET_TIME_MIN_S = 60;
export const TARGET_TIME_MAX_S = 18_000;
export const TARGET_PACE_MIN_S_PER_KM = 120;
export const TARGET_PACE_MAX_S_PER_KM = 900;

export function getTargetValidationError(config: RunTargetConfigSlice): string | null {
  if (config.target.type === 'none') return null;
  if (config.activityType === 'intervals' || config.activityType === 'treadmill') return null;

  const value = config.target.value;
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return null;
  }

  switch (config.target.type) {
    case 'distance':
      if (value < TARGET_DISTANCE_MIN_M) return 'Distance must be at least 0.5km';
      if (value > TARGET_DISTANCE_MAX_M) return 'Distance must be at most 100km';
      return null;
    case 'time':
      if (value < TARGET_TIME_MIN_S) return 'Duration must be at least 1 minute';
      if (value > TARGET_TIME_MAX_S) return 'Duration must be at most 5 hours';
      return null;
    case 'pace':
      if (value < TARGET_PACE_MIN_S_PER_KM) return 'Pace must be at least 2:00/km';
      if (value > TARGET_PACE_MAX_S_PER_KM) return 'Pace must be at most 15:00/km';
      return null;
  }
  return null;
}
