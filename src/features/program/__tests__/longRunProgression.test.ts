/**
 * Progressive long runs in race-prep plans.
 *
 * ── The defect this pins against ─────────────────────────────────────────
 *
 * `pickLongTemplateId` used to choose ONE template for the whole plan from a
 * single `peakLongKm >= 15` comparison. Measured against the real generator
 * before the fix, a 27-week plan produced:
 *
 *     5k       longest long run = long_10k
 *     10k      longest long run = long_10k
 *     half     longest long run = long_15k
 *     marathon longest long run = long_15k
 *
 * A marathoner trained to 15 km and then raced 42.2 km — a 2.8x jump — and
 * `peakLongKm: 32` in RACE_CONFIGS was dead data, only ever feeding that
 * `>= 15`, which is why half and marathon were identical.
 *
 * ── What is asserted, and what would be circular ─────────────────────────
 *
 * The temptation with a ramp is to recompute the expected distance with the
 * same formula and compare — which pins consistency, not behaviour, and
 * survives almost any mutation of the formula. So the assertions here are
 * PROPERTIES a training block must have and the old code demonstrably did
 * not: monotone-non-decreasing up to a peak, a peak proportional to the race
 * distance, distinct plans for distinct distances, cutbacks that step DOWN,
 * and a base that starts near `baseLongKm` rather than at the ceiling.
 */
import { describe, it, expect } from "vitest";

import {
  generateRacePlanV2,
  longRunKmForWeek,
  longTierForKm,
  TAPER_WEEKS_BY_DISTANCE,
  getRaceFloorWeeks,
  type RunVolumePreset,
} from "../runScheduler";
import { generateSchedule } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";

const CURRENT = "2026-06-01";
const WEEK_START = localWeekKey(parseLocalDate(CURRENT));
const DISTANCES = ["5k", "10k", "half", "marathon"] as const;

function targetDate(daysAhead: number): string {
  const d = parseLocalDate(CURRENT);
  d.setDate(d.getDate() + daysAhead);
  return localDateString(d);
}

function plan(args: {
  distance: (typeof DISTANCES)[number];
  daysAhead: number;
  volume?: RunVolumePreset;
}) {
  return generateRacePlanV2({
    weekSchedule: generateSchedule(2, 4),
    raceGoal: {
      distance: args.distance,
      targetDate: targetDate(args.daysAhead),
    },
    weeklyRunDays: 4,
    currentDate: CURRENT,
    weekStart: WEEK_START,
    tuning: { volume: args.volume ?? "standard", difficulty: "standard" },
  });
}

const LONG_KM_BY_ID = new Map(
  RUN_TEMPLATES.filter((t) => t.type === "long").map((t) => [
    t.id,
    t.config.targetDistanceKm ?? 0,
  ])
);

/** Per-week longest prescribed long run in km; 0 for weeks with none
 *  (taper and race weeks drop the long run to an easy run by design). */
function longKmPerWeek(p: { weeks: { templateId: string }[][] }): number[] {
  return p.weeks.map((week) =>
    week.reduce(
      (max, d) => Math.max(max, LONG_KM_BY_ID.get(d.templateId) ?? 0),
      0
    )
  );
}

describe("LONG_RUN_TIERS ↔ RUN_TEMPLATES", () => {
  it("the tier ladder is set-equal to the long-typed templates", () => {
    // The scheduler keeps its own ordered ladder rather than deriving it, so
    // a template added to the registry without a tier (or a tier pointing at
    // a template that was renamed away) is invisible until a plan emits an
    // id the prefill can't resolve.
    const emitted = new Set<string>();
    for (const distance of DISTANCES) {
      for (const daysAhead of [60, 120, 200, 300]) {
        for (const volume of ["lighter", "standard", "bigger"] as const) {
          for (const d of plan({ distance, daysAhead, volume }).weeks.flat()) {
            if (LONG_KM_BY_ID.has(d.templateId)) emitted.add(d.templateId);
          }
        }
      }
    }
    expect(emitted).toEqual(new Set(LONG_KM_BY_ID.keys()));
  });

  it("longTierForKm never prescribes MORE than asked, and floors at the shortest tier", () => {
    const ladder = [...LONG_KM_BY_ID.values()].sort((a, b) => a - b);
    const shortest = ladder[0];
    for (let km = 0; km <= 40; km += 0.5) {
      const chosen = LONG_KM_BY_ID.get(longTierForKm(km))!;
      if (km >= shortest) expect(chosen, `${km}km`).toBeLessThanOrEqual(km);
      else expect(chosen, `${km}km`).toBe(shortest);
    }
  });
});

describe("the long run progresses toward the race", () => {
  it("a marathon plan peaks far above a 5K plan (the 2.8x-jump defect)", () => {
    const peaks = Object.fromEntries(
      DISTANCES.map((d) => [
        d,
        Math.max(...longKmPerWeek(plan({ distance: d, daysAhead: 200 }))),
      ])
    ) as Record<(typeof DISTANCES)[number], number>;

    // Strictly ordered by race demand. Pre-fix, half === marathon === 15
    // and 5k === 10k === 10, so two of these three comparisons failed.
    expect(peaks["5k"]).toBeLessThanOrEqual(peaks["10k"]);
    expect(peaks["10k"]).toBeLessThan(peaks.half);
    expect(peaks.half).toBeLessThan(peaks.marathon);
    // And the marathon peak is a credible fraction of the race, not a third
    // of it. 30km against 42.2km sits inside the Hansons(~26)-Pfitzinger(~32)
    // bracket; 15km did not.
    expect(peaks.marathon / 42.2).toBeGreaterThan(0.6);
  });

  it("the ramp actually ramps — a long marathon block uses several tiers", () => {
    const weekly = longKmPerWeek(
      plan({ distance: "marathon", daysAhead: 200 })
    );
    const tiers = new Set(weekly.filter((km) => km > 0));
    expect(tiers.size).toBeGreaterThanOrEqual(3);
    // First long run is near base, not at the ceiling.
    const first = weekly.find((km) => km > 0)!;
    expect(first).toBeLessThan(Math.max(...weekly));
  });

  it("the trend is non-decreasing except at cutbacks, and cutbacks step DOWN", () => {
    // Tests the shape rather than the formula: every week either holds,
    // rises, or is a genuine step back. A ramp that sawtoothed randomly
    // would satisfy neither.
    for (let w = 0; w < 30; w++) {
      const km = longRunKmForWeek({
        weekIndex: w,
        totalWeeks: 30,
        baseLongKm: 14,
        peakLongKm: 32,
        taperWeeks: 3,
        volume: "standard",
      });
      const prev =
        w === 0
          ? null
          : longRunKmForWeek({
              weekIndex: w - 1,
              totalWeeks: 30,
              baseLongKm: 14,
              peakLongKm: 32,
              taperWeeks: 3,
              volume: "standard",
            });
      expect(km, `week ${w}`).toBeGreaterThanOrEqual(14);
      if (prev !== null && km < prev) {
        // A step down is only legal as a cutback, and must recover next week.
        const next = longRunKmForWeek({
          weekIndex: w + 1,
          totalWeeks: 30,
          baseLongKm: 14,
          peakLongKm: 32,
          taperWeeks: 3,
          volume: "standard",
        });
        expect(next, `cutback at week ${w} must recover`).toBeGreaterThan(km);
      }
    }
  });

  it("inserts cutback weeks rather than climbing every single week", () => {
    const kms = Array.from({ length: 20 }, (_, w) =>
      longRunKmForWeek({
        weekIndex: w,
        totalWeeks: 24,
        baseLongKm: 14,
        peakLongKm: 32,
        taperWeeks: 3,
        volume: "standard",
      })
    );
    const stepsDown = kms.filter((km, i) => i > 0 && km < kms[i - 1]).length;
    expect(stepsDown).toBeGreaterThan(0);
  });

  it("the peak lands on the last pre-taper week, not before the block ends", () => {
    for (const distance of DISTANCES) {
      const taperWeeks = TAPER_WEEKS_BY_DISTANCE[distance];
      const totalWeeks = 20;
      const lastRamp = totalWeeks - 1 - taperWeeks - 1;
      const args = {
        totalWeeks,
        baseLongKm: 14,
        peakLongKm: 32,
        taperWeeks,
        volume: "standard" as const,
      };
      const atPeak = longRunKmForWeek({ ...args, weekIndex: lastRamp });
      for (let w = 0; w < lastRamp; w++) {
        expect(
          longRunKmForWeek({ ...args, weekIndex: w }),
          `${distance} week ${w}`
        ).toBeLessThanOrEqual(atPeak);
      }
      expect(atPeak).toBeCloseTo(32, 5);
    }
  });
});

describe("degenerate plans stay safe", () => {
  it("no headroom (peak <= base) is a flat line at base, for every volume", () => {
    for (const volume of ["lighter", "standard", "bigger"] as const) {
      for (let w = 0; w < 8; w++) {
        expect(
          longRunKmForWeek({
            weekIndex: w,
            totalWeeks: 8,
            baseLongKm: 14,
            peakLongKm: 14,
            taperWeeks: 2,
            volume,
          }),
          `${volume} week ${w}`
        ).toBe(14);
      }
    }
  });

  it("a plan with no pre-taper room never ramps", () => {
    // totalWeeks - 1 - taperWeeks - 1 <= 0: the whole plan is taper + race.
    for (let w = 0; w < 4; w++) {
      expect(
        longRunKmForWeek({
          weekIndex: w,
          totalWeeks: 4,
          baseLongKm: 14,
          peakLongKm: 32,
          taperWeeks: 3,
          volume: "standard",
        })
      ).toBe(14);
    }
  });

  it("a below-floor plan never exceeds baseLongKm, under any volume", () => {
    // The finish-safely shape. `bigger` used to need an explicit coercion to
    // "standard" here; it is now structural (the caller passes peak === base).
    for (const volume of ["lighter", "standard", "bigger"] as const) {
      const p = plan({ distance: "marathon", daysAhead: 14, volume });
      expect(p.belowFloor).toBe(true);
      // marathon baseLongKm is 14 → the 10K tier is the most it can pick.
      for (const km of longKmPerWeek(p)) expect(km).toBeLessThanOrEqual(10);
    }
  });

  it("a below-floor plan has no room to ramp — so the caller's cap is redundant TODAY", () => {
    // Honest bookkeeping for a guard whose mutation currently survives.
    //
    // generateRacePlanV2's below-floor branch passes peakLongKm ===
    // baseLongKm to stop "bigger" inflating a finish-safely week. Swapping
    // that back to config.peakLongKm changes no output, because
    //     belowFloor   ⇔ totalWeeks < taperWeeks + 1
    //     ramp exists  ⇔ totalWeeks - taperWeeks - 2 > 0
    // are mutually exclusive: the pre-taper window is already empty.
    //
    // That makes the cap defence-in-depth rather than the thing enforcing
    // the rule — fine, but only while the two definitions stay this far
    // apart. Pin the arithmetic so LOWERING getRaceFloorWeeks fails here and
    // whoever does it knows the cap has just become load-bearing.
    for (const distance of DISTANCES) {
      const taperWeeks = TAPER_WEEKS_BY_DISTANCE[distance];
      const floor = getRaceFloorWeeks(distance);
      for (let totalWeeks = 1; totalWeeks < floor; totalWeeks++) {
        const lastRampWeek = totalWeeks - 1 - taperWeeks - 1;
        expect(
          lastRampWeek,
          `${distance} @ ${totalWeeks}w`
        ).toBeLessThanOrEqual(0);
      }
    }
  });

  it("out-of-range week indices clamp instead of extrapolating", () => {
    const args = {
      totalWeeks: 20,
      baseLongKm: 14,
      peakLongKm: 32,
      taperWeeks: 3,
      volume: "standard" as const,
    };
    expect(longRunKmForWeek({ ...args, weekIndex: -5 })).toBe(14);
    const beyond = longRunKmForWeek({ ...args, weekIndex: 99 });
    expect(beyond).toBeLessThanOrEqual(32);
  });
});
