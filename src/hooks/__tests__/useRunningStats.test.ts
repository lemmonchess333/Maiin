import { describe, it, expect } from "vitest";
import { aggregateWeeklyData, type RunSummaryItem } from "../useRunningStats";

/* As of Sprint 1 (run-stat eligibility matrix), the weekly
 * aggregator applies `isVolumeEligible` internally — invalid,
 * savedAnyway, and sub-threshold records contribute nothing to
 * count, distance, or pace. The hook's `runs` array stays
 * unfiltered (so Recent Runs can render transparency badges) and
 * the aggregator is the place that enforces volume eligibility
 * for the weekly tile.
 *
 * The default fixture shape passes the volume floor (60s duration,
 * sub-thresholds overridden per-test). */

function run(
  args: Partial<RunSummaryItem> & { completedAt: Date }
): RunSummaryItem {
  return {
    id: `run-${args.completedAt.toISOString()}`,
    distance: 0,
    duration: 60,
    avgPace: 0,
    elevationGain: 0,
    calories: 0,
    activityType: "freerun",
    relativeEffort: null,
    ...args,
  };
}

describe("aggregateWeeklyData", () => {
  it("drops zero-distance zombies entirely from the week (volume eligibility)", () => {
    /* Same week: 1 legitimate 2km / 158s/km run + 3 zero-distance
       "Save anyway" entries. The aggregator's volume filter drops
       the zombies — they contribute nothing to count, distance, or
       pace. Old contract counted them in runCount; new contract
       (Sprint 1) excludes them so the tile reads honestly: "1 run,
       2.0km, 2:38/km". The transparency UI is in Recent Runs
       which reads the unfiltered `runs` array directly. */
    const week = new Date("2026-05-08T12:00:00Z"); // Friday
    const result = aggregateWeeklyData([
      run({ distance: 2000, avgPace: 158, completedAt: week }),
      run({ distance: 0, avgPace: 0, completedAt: week }),
      run({
        distance: 0,
        avgPace: 0,
        completedAt: new Date("2026-05-08T12:00:01Z"),
      }),
      run({
        distance: 0,
        avgPace: 0,
        completedAt: new Date("2026-05-08T12:00:02Z"),
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].runCount).toBe(1); // zombies excluded from count
    expect(result[0].avgPace).toBe(158);
    expect(result[0].totalDistance).toBe(2);
  });

  it("emits no week entry when EVERY run was a zombie", () => {
    /* All zero-distance → all fail volume → the week bucket never
       gets created. Different from the old behaviour where the
       week was emitted with zero values. The History weekly chart
       sees fewer bars; the empty week is honest about there being
       no real activity. */
    const day = new Date("2026-05-08T12:00:00Z");
    const result = aggregateWeeklyData([
      run({ distance: 0, avgPace: 0, completedAt: day }),
      run({
        distance: 0,
        avgPace: 0,
        completedAt: new Date("2026-05-08T12:01:00Z"),
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("drops invalid runs even when distance is positive", () => {
    /* The Sprint 1 contract: the savedAnyway flag is what marks a
       record as ineligible, not just distance. A 2km treadmill
       saved-anyway run is real distance but the user already
       acknowledged it shouldn't count. */
    const week = new Date("2026-05-08T12:00:00Z");
    const result = aggregateWeeklyData([
      run({ distance: 5000, avgPace: 150, completedAt: week }),
      run({
        distance: 2000,
        avgPace: 158,
        isInvalid: true,
        savedAnyway: true,
        completedAt: new Date("2026-05-09T12:00:00Z"),
      }),
    ]);
    expect(result[0].runCount).toBe(1);
    expect(result[0].avgPace).toBe(150);
    expect(result[0].totalDistance).toBe(5);
  });

  it("correctly averages multiple legitimate runs in the same week", () => {
    /* Distance-weighted: (150*5 + 170*3) / 8 = 157.5 -> 158. The old
       unweighted mean (160) let short runs move the weekly pace as much
       as long ones. */
    const week = new Date("2026-05-08T12:00:00Z");
    const result = aggregateWeeklyData([
      run({ distance: 5000, avgPace: 150, completedAt: week }),
      run({
        distance: 3000,
        avgPace: 170,
        completedAt: new Date("2026-05-09T12:00:00Z"),
      }),
    ]);

    expect(result[0].avgPace).toBe(158);
    expect(result[0].runCount).toBe(2);
    expect(result[0].totalDistance).toBe(8);
  });

  it("skips runs with positive distance but zero avgPace (defensive)", () => {
    /* Shouldn't happen in practice — distance > 0 implies a derivable
       pace — but if a corrupt record reaches the aggregator, treat it
       like a zombie rather than letting `avgPace=0` poison the
       weekly average. */
    const week = new Date("2026-05-08T12:00:00Z");
    const result = aggregateWeeklyData([
      run({ distance: 5000, avgPace: 150, completedAt: week }),
      run({
        distance: 5000,
        avgPace: 0,
        completedAt: new Date("2026-05-09T12:00:00Z"),
      }),
    ]);

    expect(result[0].avgPace).toBe(150);
    expect(result[0].runCount).toBe(2);
  });

  it("buckets runs into Sunday-anchored weeks", () => {
    /* Saturday + Sunday land in different weeks. 8 May 2026 is a
       Friday; 10 May 2026 is the next Sunday. */
    const friday = new Date("2026-05-08T12:00:00Z");
    const sunday = new Date("2026-05-10T12:00:00Z");
    const result = aggregateWeeklyData([
      run({ distance: 5000, avgPace: 150, completedAt: friday }),
      run({ distance: 3000, avgPace: 180, completedAt: sunday }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].avgPace).toBe(150); // first week (sorted ascending)
    expect(result[1].avgPace).toBe(180);
  });
  it("distance-weights the weekly avg pace (no average-of-averages skew)", () => {
    /* Same week: a 1 km recovery jog at 7:00/km (420 s/km) and a 9 km
       session at 4:30/km (270 s/km). An unweighted mean would report
       345 s/km (5:45); the distance-weighted truth is
       (420*1 + 270*9) / 10 = 285 s/km (4:45). */
    const week = new Date("2026-05-08T12:00:00Z");
    const result = aggregateWeeklyData([
      run({ distance: 1000, avgPace: 420, completedAt: week }),
      run({
        distance: 9000,
        avgPace: 270,
        completedAt: new Date("2026-05-08T13:00:00Z"),
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].avgPace).toBe(285);
  });
});
