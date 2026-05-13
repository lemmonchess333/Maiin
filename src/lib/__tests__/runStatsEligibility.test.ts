import { describe, it, expect } from 'vitest';
import {
  isVolumeEligible,
  isPaceEligible,
  type RunRecord,
} from '../runStatsEligibility';
import { isCountableRun } from '../runGuards';

/* The Sprint 1 metric/source matrix. Volume includes treadmill +
 * manual; pace metrics (Best Pace, Fastest 1K, Fastest 5K, Longest
 * Run) require outdoor GPS. Both helpers also enforce the base
 * floor (no isInvalid, no savedAnyway, distance >= 50m, duration
 * >= 30s) so legacy zombies and saved-anyway misclicks stay out.
 *
 * The screenshot bug: a treadmill 2km / 5:17 record was producing
 * "Best Pace 2:38/km" because pace eligibility wasn't being
 * checked. The matrix codifies the fix. */

const validOutdoor: RunRecord = {
  isInvalid: false,
  savedAnyway: false,
  distance: 5000,
  duration: 1500,
  avgPace: 300,
  activityType: 'easy',
};

describe('isVolumeEligible — base floor', () => {
  it('counts a normal valid outdoor run', () => {
    expect(isVolumeEligible(validOutdoor)).toBe(true);
  });

  it('counts treadmill runs that meet the floor', () => {
    expect(isVolumeEligible({ ...validOutdoor, activityType: 'treadmill', distance: 2000, duration: 317 })).toBe(true);
  });

  it('counts manual runs that meet the floor', () => {
    expect(isVolumeEligible({ ...validOutdoor, activityType: 'manual', distance: 2000, duration: 317 })).toBe(true);
  });

  it('drops isInvalid records', () => {
    expect(isVolumeEligible({ ...validOutdoor, isInvalid: true })).toBe(false);
  });

  it('drops savedAnyway records', () => {
    expect(isVolumeEligible({ ...validOutdoor, savedAnyway: true })).toBe(false);
  });

  it('drops sub-50m distance (legacy zero-distance zombie)', () => {
    expect(isVolumeEligible({ ...validOutdoor, distance: 0 })).toBe(false);
    expect(isVolumeEligible({ ...validOutdoor, distance: 49 })).toBe(false);
  });

  it('counts exactly 50m / 30s — the floor edge', () => {
    expect(isVolumeEligible({ ...validOutdoor, distance: 50, duration: 30 })).toBe(true);
  });

  it('drops sub-30s duration (legacy 0:05 misclick)', () => {
    expect(isVolumeEligible({ ...validOutdoor, duration: 5 })).toBe(false);
    expect(isVolumeEligible({ ...validOutdoor, duration: 29 })).toBe(false);
  });

  it('drops records missing both distance and duration', () => {
    expect(isVolumeEligible({ activityType: 'easy' })).toBe(false);
  });
});

describe('isPaceEligible — outdoor + finite pace', () => {
  it('counts a valid outdoor run', () => {
    expect(isPaceEligible(validOutdoor)).toBe(true);
  });

  it('drops treadmill (matrix: not pace-eligible — typed distance, no GPS)', () => {
    /* The screenshot case. A treadmill 2km / 5:17 (avgPace 158s/km
       = 2:38/km) is real activity — counts for volume — but a
       believable Best Pace 2:38/km is not something a treadmill
       can authoritatively claim. */
    expect(isPaceEligible({ ...validOutdoor, activityType: 'treadmill', distance: 2000, duration: 317, avgPace: 158 })).toBe(false);
  });

  it('drops manual (matrix: not pace-eligible — typed distance, GPS never locked)', () => {
    expect(isPaceEligible({ ...validOutdoor, activityType: 'manual', distance: 2000, duration: 317, avgPace: 158 })).toBe(false);
  });

  it('counts every outdoor activityType', () => {
    for (const t of ['easy', 'tempo', 'intervals', 'long', 'race', 'freerun', 'guided'] as const) {
      expect(isPaceEligible({ ...validOutdoor, activityType: t })).toBe(true);
    }
  });

  it('drops missing activityType (conservative on legacy/unknown)', () => {
    /* A legacy run that doesn't declare its source shouldn't get to
       set a Best Pace — we'd have no way to tell if it was a real
       outdoor effort or a typo treadmill entry. */
    const { activityType: _t, ...noType } = validOutdoor;
    void _t;
    expect(isPaceEligible(noType)).toBe(false);
  });

  it('drops zero / non-finite avgPace', () => {
    expect(isPaceEligible({ ...validOutdoor, avgPace: 0 })).toBe(false);
    expect(isPaceEligible({ ...validOutdoor, avgPace: -1 })).toBe(false);
    expect(isPaceEligible({ ...validOutdoor, avgPace: Infinity })).toBe(false);
    expect(isPaceEligible({ ...validOutdoor, avgPace: NaN })).toBe(false);
  });

  it('inherits the volume floor (isInvalid / savedAnyway / sub-thresholds)', () => {
    expect(isPaceEligible({ ...validOutdoor, isInvalid: true })).toBe(false);
    expect(isPaceEligible({ ...validOutdoor, savedAnyway: true })).toBe(false);
    expect(isPaceEligible({ ...validOutdoor, distance: 0 })).toBe(false);
    expect(isPaceEligible({ ...validOutdoor, duration: 5 })).toBe(false);
  });
});

describe('screenshot acceptance case — treadmill-only account', () => {
  /* The exact case from the screenshot: an account with only a
     treadmill 2km / 5:17 run should:
       - count toward total runs and total distance
       - NOT produce a Best Pace, Fastest 1K, Fastest 5K, or
         Longest Run
     Pinning that the matrix produces the right verdict for each
     downstream filter. */
  const treadmill2k = {
    isInvalid: false,
    savedAnyway: false,
    distance: 2000,
    duration: 317,
    avgPace: 158,
    activityType: 'treadmill' as const,
  };

  it('counts as activity volume', () => {
    expect(isVolumeEligible(treadmill2k)).toBe(true);
  });

  it('does NOT count toward Best Pace / Fastest-K / Longest Run', () => {
    expect(isPaceEligible(treadmill2k)).toBe(false);
  });
});

describe('isCountableRun back-compat alias', () => {
  /* Existing call sites (useLifetimeRunStats, useStreaks,
     personalTrajectory, leaderboard) all import `isCountableRun`
     and expect volume semantics — this pins the alias so a future
     refactor doesn't drift. */
  it('agrees with isVolumeEligible across the matrix', () => {
    const cases: RunRecord[] = [
      validOutdoor,
      { ...validOutdoor, isInvalid: true },
      { ...validOutdoor, savedAnyway: true },
      { ...validOutdoor, distance: 0 },
      { ...validOutdoor, duration: 5 },
      { ...validOutdoor, activityType: 'treadmill' },
      { ...validOutdoor, activityType: 'manual' },
    ];
    for (const c of cases) {
      expect(isCountableRun(c)).toBe(isVolumeEligible(c));
    }
  });
});
