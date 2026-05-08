import { describe, it, expect } from 'vitest';
import { aggregateWeeklyData, type RunSummaryItem } from '../useRunningStats';

/* The History page was showing "AVG PACE 0:40 /km" after a few
 * "Save anyway" 0km runs (the P0 sprint's invalid-run save path).
 * Root cause: the weekly aggregator summed every run's avgPace —
 * including the zeros from 0km records — and divided by total count,
 * dragging the weekly value toward zero.
 *
 * Pinning the corrected contract: zero-distance runs still count
 * toward `runCount` (so the History run-count tile stays honest about
 * how many entries the user has) but only positive-distance +
 * positive-pace runs contribute to `avgPace`. */

function run(args: Partial<RunSummaryItem> & { completedAt: Date }): RunSummaryItem {
  return {
    id: `run-${args.completedAt.toISOString()}`,
    distance: 0,
    duration: 0,
    avgPace: 0,
    elevationGain: 0,
    calories: 0,
    activityType: 'freerun',
    ...args,
  };
}

describe('aggregateWeeklyData', () => {
  it('does NOT drag the weekly avgPace toward zero with 0km zombie runs', () => {
    /* Same week: 1 legitimate 2km / 158s/km run + 3 zero-distance
       "Save anyway" entries with avgPace=0. Pre-fix: paceSum=158,
       count=4, avgPace=Math.round(158/4)=40 → "0:40/km". Post-fix:
       only the legit run contributes → avgPace=158 → "2:38/km". */
    const week = new Date('2026-05-08T12:00:00Z'); // Friday
    const result = aggregateWeeklyData([
      run({ distance: 2000, avgPace: 158, completedAt: week }),
      run({ distance: 0, avgPace: 0, completedAt: week }),
      run({ distance: 0, avgPace: 0, completedAt: new Date('2026-05-08T12:00:01Z') }),
      run({ distance: 0, avgPace: 0, completedAt: new Date('2026-05-08T12:00:02Z') }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].runCount).toBe(4); // total runs unchanged — zombies still counted
    expect(result[0].avgPace).toBe(158); // pace not dragged toward zero
    expect(result[0].totalDistance).toBe(2); // distance unchanged — zombies legitimately added 0km
  });

  it('returns avgPace=0 when EVERY run that week was a zombie', () => {
    /* All zero-distance entries → no positive-pace samples → avgPace
       falls back to 0 cleanly without dividing by zero. */
    const day = new Date('2026-05-08T12:00:00Z');
    const result = aggregateWeeklyData([
      run({ distance: 0, avgPace: 0, completedAt: day }),
      run({ distance: 0, avgPace: 0, completedAt: new Date('2026-05-08T12:01:00Z') }),
    ]);

    expect(result[0].avgPace).toBe(0);
    expect(result[0].runCount).toBe(2);
    expect(result[0].totalDistance).toBe(0);
  });

  it('correctly averages multiple legitimate runs in the same week', () => {
    /* Mean of 150 and 170 is 160 — verifies the unrelated averaging
       path still works after the paceCount split. */
    const week = new Date('2026-05-08T12:00:00Z');
    const result = aggregateWeeklyData([
      run({ distance: 5000, avgPace: 150, completedAt: week }),
      run({ distance: 3000, avgPace: 170, completedAt: new Date('2026-05-09T12:00:00Z') }),
    ]);

    expect(result[0].avgPace).toBe(160);
    expect(result[0].runCount).toBe(2);
    expect(result[0].totalDistance).toBe(8);
  });

  it('skips runs with positive distance but zero avgPace (defensive)', () => {
    /* Shouldn't happen in practice — distance > 0 implies a derivable
       pace — but if a corrupt record reaches the aggregator, treat it
       like a zombie rather than letting `avgPace=0` poison the
       weekly average. */
    const week = new Date('2026-05-08T12:00:00Z');
    const result = aggregateWeeklyData([
      run({ distance: 5000, avgPace: 150, completedAt: week }),
      run({ distance: 5000, avgPace: 0, completedAt: new Date('2026-05-09T12:00:00Z') }),
    ]);

    expect(result[0].avgPace).toBe(150);
    expect(result[0].runCount).toBe(2);
  });

  it('buckets runs into Sunday-anchored weeks', () => {
    /* Saturday + Sunday land in different weeks. 8 May 2026 is a
       Friday; 10 May 2026 is the next Sunday. */
    const friday = new Date('2026-05-08T12:00:00Z');
    const sunday = new Date('2026-05-10T12:00:00Z');
    const result = aggregateWeeklyData([
      run({ distance: 5000, avgPace: 150, completedAt: friday }),
      run({ distance: 3000, avgPace: 180, completedAt: sunday }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].avgPace).toBe(150); // first week (sorted ascending)
    expect(result[1].avgPace).toBe(180);
  });
});
