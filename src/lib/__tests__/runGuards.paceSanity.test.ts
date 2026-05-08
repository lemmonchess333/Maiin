import { describe, it, expect } from 'vitest';
import {
  getInvalidRunReason,
  isInvalidRun,
  MAX_PLAUSIBLE_SPEED_MS,
} from '../runGuards';

/* Pace-sanity guard tests. Treadmill (and later manual) accept an
 * arbitrary positive distance from a 0.05km floor — a user typing
 * `20` instead of `2.0` previously saved a 20km / 0:08 record that
 * polluted weekly totals and the activity feed.
 *
 * The check matches the 12 m/s threshold already used by
 * `isValidReading()` in `src/lib/gps.ts` for outdoor GPS validation,
 * so the two paths agree on what an "implausibly fast" run looks
 * like. Lives in a separate test file to keep the diff isolated and
 * avoid merge conflicts with the parallel runGuards work in PR #474
 * (which adds activityType='manual'). */

describe('getInvalidRunReason — pace-sanity (treadmill)', () => {
  it("flags 'too-fast' when implied speed exceeds the 12 m/s threshold", () => {
    /* The canonical fat-finger case from QA: user typed `20` (km) for
       a run they recorded over ~8 seconds. 20000m / 8s = 2500 m/s,
       absurdly above the threshold. */
    expect(getInvalidRunReason({
      activityType: 'treadmill',
      distanceKm: 20,
      elapsedSeconds: 8,
    })).toBe('too-fast');
  });

  it("does NOT flag fast-but-plausible treadmill runs", () => {
    /* 5km in 25 minutes = 12 km/h = ~3.3 m/s. Comfortably under the
       threshold — a normal moderate-intensity treadmill run. */
    expect(getInvalidRunReason({
      activityType: 'treadmill',
      distanceKm: 5,
      elapsedSeconds: 1500,
    })).toBeNull();
  });

  it("does not raise 'too-fast' for elite-but-plausible aggregate paces", () => {
    /* 1km in 3 minutes = 5.56 m/s — fast but well within human range.
       Should NOT trigger 'too-fast'. The check is calibrated for
       orders-of-magnitude typo errors, not subtle ones. We pass an
       elapsed > 30s so the test isolates the speed check from the
       short-run floor (which would catch sub-30s treadmill runs for
       an unrelated reason on this branch). */
    expect(getInvalidRunReason({
      activityType: 'treadmill',
      distanceKm: 1,
      elapsedSeconds: 180,
    })).toBeNull();
  });

  it("prefers 'too-fast' over 'too-short' when both conditions trigger", () => {
    /* The 20km / 0:08 case: elapsed < 30s AND implied speed > 12 m/s.
       Both predicates match. The user cares about the more specific
       reason (typo), so the helper returns 'too-fast' first. */
    const reason = getInvalidRunReason({
      activityType: 'treadmill',
      distanceKm: 20,
      elapsedSeconds: 8,
    });
    expect(reason).toBe('too-fast');
    expect(reason).not.toBe('too-short');
  });

  it('handles elapsedSeconds === 0 without dividing by zero', () => {
    /* Defensive: TreadmillMode requires the timer to start before the
       distance input is enabled, so elapsed is always > 0 when this
       runs. Belt-and-braces — the helper just needs to not throw.
       With elapsed===0 the speed check is skipped (the
       requiresManualDistance branch is gated on `elapsedSeconds > 0`)
       and the helper falls through to the uniform 30s elapsed-time
       floor, so a 5km / 0s entry now resolves to 'too-short'. The
       test's primary purpose is still the no-throw assertion. */
    expect(() => getInvalidRunReason({
      activityType: 'treadmill',
      distanceKm: 5,
      elapsedSeconds: 0,
    })).not.toThrow();
    expect(getInvalidRunReason({
      activityType: 'treadmill',
      distanceKm: 5,
      elapsedSeconds: 0,
    })).toBe('too-short');
  });
});

describe('getInvalidRunReason — outdoor (no pace-sanity needed)', () => {
  it("does NOT apply the 12 m/s aggregate check to outdoor runs", () => {
    /* GPS's isValidReading() filters per-fix at the same 12 m/s
       threshold, so the aggregate distance can't exceed that anyway.
       Re-checking here would be redundant. The helper's branch on
       `requiresManualDistance` keeps the check scoped. Constructing
       a synthetic-but-implausible outdoor record (only possible if
       isValidReading is bypassed, which doesn't happen in the live
       app) shouldn't trigger 'too-fast' — it'd hit the regular
       too-short check instead. */
    const reason = getInvalidRunReason({
      activityType: 'freerun',
      distanceKm: 20,
      elapsedSeconds: 8,
    });
    /* elapsed < 30s → 'too-short', NOT 'too-fast'. The point is that
       outdoor runs never get the 'too-fast' reason. */
    expect(reason).toBe('too-short');
  });

  it("flags outdoor runs under the elapsed-time floor", () => {
    expect(getInvalidRunReason({
      activityType: 'easy',
      distanceKm: 0.5,
      elapsedSeconds: 15,
    })).toBe('too-short');
  });

  it("passes outdoor runs above both floors", () => {
    expect(getInvalidRunReason({
      activityType: 'easy',
      distanceKm: 0.5,
      elapsedSeconds: 60,
    })).toBeNull();
  });
});

describe('isInvalidRun matches getInvalidRunReason !== null', () => {
  /* Pin the contract that the boolean wrapper is just a thin
   * convenience over the typed reason — future callers should be
   * able to switch between the two without behaviour changes. */
  it.each([
    { activityType: 'treadmill' as const, distanceKm: 20, elapsedSeconds: 8, expected: true },
    { activityType: 'treadmill' as const, distanceKm: 5, elapsedSeconds: 1500, expected: false },
    { activityType: 'easy' as const, distanceKm: 0.5, elapsedSeconds: 15, expected: true },
    { activityType: 'easy' as const, distanceKm: 0.5, elapsedSeconds: 60, expected: false },
  ])('agrees on $activityType $distanceKm/$elapsedSeconds → $expected', ({ activityType, distanceKm, elapsedSeconds, expected }) => {
    expect(isInvalidRun({ activityType, distanceKm, elapsedSeconds })).toBe(expected);
    expect(getInvalidRunReason({ activityType, distanceKm, elapsedSeconds }) !== null).toBe(expected);
  });
});

describe('MAX_PLAUSIBLE_SPEED_MS', () => {
  it('matches the 12 m/s convention from gps.ts isValidReading', () => {
    /* If this constant moves, the gps.ts isValidReading() per-fix
       filter should move with it (or vice versa) — they're meant to
       agree so outdoor and manual paths reject the same impossible
       speeds. */
    expect(MAX_PLAUSIBLE_SPEED_MS).toBe(12);
  });
});
