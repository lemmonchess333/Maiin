import { describe, it, expect } from 'vitest';
import {
  getTargetValidationError,
  TARGET_DISTANCE_MIN_M,
  TARGET_DISTANCE_MAX_M,
  TARGET_TIME_MIN_S,
  TARGET_TIME_MAX_S,
  TARGET_PACE_MIN_S_PER_KM,
  TARGET_PACE_MAX_S_PER_KM,
  type RunTargetConfigSlice,
} from '../runTargetValidation';

/* Pre-flight target validation. The Start button reads the verdict
 * and disables when non-null, so a sub-threshold target never ships
 * even if the user tapped Start before the input lost focus. */

const valid: RunTargetConfigSlice = {
  activityType: 'easy',
  target: { type: 'distance', value: 5000 },
};

describe('getTargetValidationError — skip cases', () => {
  it('returns null when target.type is none', () => {
    expect(getTargetValidationError({
      activityType: 'easy',
      target: { type: 'none' },
    })).toBeNull();
  });

  it('returns null for intervals (interval-config UI owns its own validation)', () => {
    expect(getTargetValidationError({
      activityType: 'intervals',
      target: { type: 'distance', value: 1 }, // sub-threshold but skipped
    })).toBeNull();
  });

  it('returns null for treadmill (target inputs are not rendered)', () => {
    expect(getTargetValidationError({
      activityType: 'treadmill',
      target: { type: 'distance', value: 1 },
    })).toBeNull();
  });

  it('returns null when value is undefined / NaN / Infinity (mid-edit)', () => {
    expect(getTargetValidationError({
      activityType: 'easy',
      target: { type: 'distance' },
    })).toBeNull();
    expect(getTargetValidationError({
      activityType: 'easy',
      target: { type: 'distance', value: NaN },
    })).toBeNull();
    expect(getTargetValidationError({
      activityType: 'easy',
      target: { type: 'distance', value: Infinity },
    })).toBeNull();
  });
});

describe('getTargetValidationError — distance', () => {
  it('passes a normal 5km target', () => {
    expect(getTargetValidationError(valid)).toBeNull();
  });

  it('passes the floor edge (0.5km)', () => {
    expect(getTargetValidationError({
      ...valid,
      target: { type: 'distance', value: TARGET_DISTANCE_MIN_M },
    })).toBeNull();
  });

  it('passes the ceiling edge (100km)', () => {
    expect(getTargetValidationError({
      ...valid,
      target: { type: 'distance', value: TARGET_DISTANCE_MAX_M },
    })).toBeNull();
  });

  it('rejects 0.005km (the screenshot bug — 5m typed mid-edit)', () => {
    expect(getTargetValidationError({
      ...valid,
      target: { type: 'distance', value: 5 },
    })).toBe('Distance must be at least 0.5km');
  });

  it('rejects sub-floor values just below 0.5km', () => {
    expect(getTargetValidationError({
      ...valid,
      target: { type: 'distance', value: 499 },
    })).toBe('Distance must be at least 0.5km');
  });

  it('rejects above-ceiling values', () => {
    expect(getTargetValidationError({
      ...valid,
      target: { type: 'distance', value: 100_001 },
    })).toBe('Distance must be at most 100km');
  });
});

describe('getTargetValidationError — time', () => {
  it('passes a normal 30-min target', () => {
    expect(getTargetValidationError({
      activityType: 'easy',
      target: { type: 'time', value: 1800 },
    })).toBeNull();
  });

  it('passes the 1-minute floor edge', () => {
    expect(getTargetValidationError({
      activityType: 'easy',
      target: { type: 'time', value: TARGET_TIME_MIN_S },
    })).toBeNull();
  });

  it('passes the 5-hour ceiling edge', () => {
    expect(getTargetValidationError({
      activityType: 'easy',
      target: { type: 'time', value: TARGET_TIME_MAX_S },
    })).toBeNull();
  });

  it('rejects 30 seconds (sub-1-minute floor)', () => {
    expect(getTargetValidationError({
      activityType: 'easy',
      target: { type: 'time', value: 30 },
    })).toBe('Duration must be at least 1 minute');
  });

  it('rejects above-ceiling values', () => {
    expect(getTargetValidationError({
      activityType: 'easy',
      target: { type: 'time', value: 18_001 },
    })).toBe('Duration must be at most 5 hours');
  });
});

describe('getTargetValidationError — pace', () => {
  it('passes a normal 5:30/km target', () => {
    expect(getTargetValidationError({
      activityType: 'easy',
      target: { type: 'pace', value: 330 },
    })).toBeNull();
  });

  it('passes the elite 2:00/km floor edge', () => {
    expect(getTargetValidationError({
      activityType: 'easy',
      target: { type: 'pace', value: TARGET_PACE_MIN_S_PER_KM },
    })).toBeNull();
  });

  it('passes the slow-walk 15:00/km ceiling edge', () => {
    expect(getTargetValidationError({
      activityType: 'easy',
      target: { type: 'pace', value: TARGET_PACE_MAX_S_PER_KM },
    })).toBeNull();
  });

  it('rejects 0:30/km (impossible — way faster than world record)', () => {
    expect(getTargetValidationError({
      activityType: 'easy',
      target: { type: 'pace', value: 30 },
    })).toBe('Pace must be at least 2:00/km');
  });

  it('rejects 60:00/km (slower than walking)', () => {
    expect(getTargetValidationError({
      activityType: 'easy',
      target: { type: 'pace', value: 3600 },
    })).toBe('Pace must be at most 15:00/km');
  });
});
