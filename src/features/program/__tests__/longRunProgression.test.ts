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
  easyRunMinutesForWeek,
  longRunKmForWeek,
  longTierForKm,
  maxSchedulableLongKm,
  PEAK_HOLD_FRACTION,
  LONG_RUN_MAX_MINUTES,
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
    recentLayoff: "none",
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
const LONG_MIN_BY_ID = new Map(
  RUN_TEMPLATES.filter((t) => t.type === "long").map((t) => [
    t.id,
    t.estimatedDuration,
  ])
);
const MIN_BY_ID = new Map(
  RUN_TEMPLATES.map((t) => [t.id, t.estimatedDuration])
);

/** Total prescribed minutes per week. */
function minutesPerWeek(p: { weeks: { templateId: string }[][] }): number[] {
  return p.weeks.map((wk) =>
    wk.reduce((s, d) => s + (MIN_BY_ID.get(d.templateId) ?? 0), 0)
  );
}

/** The long run's share of its own week's minutes, per week. */
function longSharePerWeek(p: { weeks: { templateId: string }[][] }): number[] {
  const totals = minutesPerWeek(p);
  return p.weeks.map((wk, i) => {
    const long = wk.reduce(
      (max, d) => Math.max(max, LONG_MIN_BY_ID.get(d.templateId) ?? 0),
      0
    );
    return totals[i] === 0 ? 0 : long / totals[i];
  });
}

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

/** Every long template a plan can emit, across the whole input space. */
function emittedLongIds(): Set<string> {
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
  return emitted;
}

describe("LONG_RUN_TIERS ↔ RUN_TEMPLATES", () => {
  it("every long template under the time cap is reachable by some plan", () => {
    // The scheduler keeps its own ordered ladder rather than deriving it, so
    // a template added to the registry without a tier (or a tier pointing at
    // a template that was renamed away) is invisible until a plan emits an
    // id the prefill can't resolve. A rung nothing can reach is the same
    // dead data as the `peakLongKm: 32` this module was written to fix.
    const reachable = new Set(
      [...LONG_MIN_BY_ID.entries()]
        .filter(([, min]) => min <= LONG_RUN_MAX_MINUTES)
        .map(([id]) => id)
    );
    expect(emittedLongIds()).toEqual(reachable);
  });

  it("long_30k is excluded BY THE TIME CAP, not by accident", () => {
    // Daniels caps the long run at 150 minutes; long_30k is 170. It stays in
    // the registry so a user can choose it in the day sheet, but the
    // scheduler must never prescribe it. Pin both halves — that it exists,
    // and that it is over the cap — so raising LONG_RUN_MAX_MINUTES is a
    // deliberate act with a failing test attached rather than a silent
    // widening of what gets auto-prescribed.
    expect(LONG_MIN_BY_ID.get("long_30k")).toBeGreaterThan(
      LONG_RUN_MAX_MINUTES
    );
    expect(emittedLongIds().has("long_30k")).toBe(false);
    for (const id of emittedLongIds()) {
      expect(LONG_MIN_BY_ID.get(id), id).toBeLessThanOrEqual(
        LONG_RUN_MAX_MINUTES
      );
    }
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
    // and 5k === 10k === 10, so ALL THREE of these comparisons failed.
    expect(peaks["5k"]).toBeLessThan(peaks["10k"]);
    expect(peaks["10k"]).toBeLessThan(peaks.half);
    expect(peaks.half).toBeLessThan(peaks.marathon);
    // And the marathon peak is a credible fraction of the race rather than a
    // third of it. 25km/42.2km ≈ 0.59 — essentially Hansons' deliberately
    // conservative ~26km ceiling, which is where the 150-minute time cap
    // lands. 15km (0.36) was not defensible under any methodology.
    expect(peaks.marathon / 42.2).toBeGreaterThan(0.55);
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
      // Run17: the ramp ends at the peak the ceiling lets THIS runner
      // schedule — 25 km on the nominal table, held for the last ~15% of
      // the ramp — not at the 32 km the config declares, which left the
      // last six weeks flat at the ceiling tier.
      expect(maxSchedulableLongKm(null)).toBe(25);
      expect(atPeak).toBeLessThanOrEqual(25 * (1 + PEAK_HOLD_FRACTION));
      expect(atPeak).toBeGreaterThanOrEqual(25);
      expect(longTierForKm(atPeak)).toBe("long_25k");
    }
  });
});

describe("Run17 — the 150-minute ceiling measures the runner's own pace", () => {
  const marathon = (easyPaceSPerKm: number | null) =>
    generateRacePlanV2({
      recentLayoff: "none",
      weekSchedule: generateSchedule(2, 4),
      raceGoal: { distance: "marathon", targetDate: targetDate(20 * 7) },
      weeklyRunDays: 4,
      currentDate: CURRENT,
      weekStart: WEEK_START,
      easyPaceSPerKm,
    });
  const peakKm = (out: ReturnType<typeof generateRacePlanV2>) =>
    Math.max(
      ...out.weeks.flat().map((r) => LONG_KM_BY_ID.get(r.templateId) ?? 0)
    );

  it("no confirmed benchmark → the nominal table, exactly as before", () => {
    expect(maxSchedulableLongKm(null)).toBe(25);
    expect(maxSchedulableLongKm(undefined)).toBe(25);
    expect(longTierForKm(32)).toBe("long_25k");
    expect(peakKm(marathon(null))).toBe(25);
  });

  it("5:00/km → 30 km fits in 150 minutes, so long_30k becomes schedulable", () => {
    expect(maxSchedulableLongKm(300)).toBe(30);
    expect(longTierForKm(32, 300)).toBe("long_30k");
    expect(peakKm(marathon(300))).toBe(30);
  });

  it("6:00/km → 25 km sits exactly on the ceiling; 30 does not", () => {
    expect(maxSchedulableLongKm(360)).toBe(25);
    expect(peakKm(marathon(360))).toBe(25);
  });

  it("7:00/km → 25 km would take 175 minutes, so the ceiling is 20 km", () => {
    expect(maxSchedulableLongKm(420)).toBe(20);
    expect(longTierForKm(32, 420)).toBe("long_20k");
    expect(peakKm(marathon(420))).toBe(20);
  });

  it("a pace so slow that no tier fits still yields the shortest tier — the floor, not the ceiling", () => {
    expect(longTierForKm(32, 3600)).toBe("long_6k");
  });

  it("the ramp is monotone to the emitted peak — no flat run at the ceiling before the last ramp week", () => {
    for (const pace of [null, 300, 360, 420]) {
      const out = marathon(pace);
      const taperWeeks = TAPER_WEEKS_BY_DISTANCE.marathon;
      const longs = out.weeks
        .slice(0, out.totalWeeks - taperWeeks - 1)
        .map((w) => w.find((r) => r.type === "long"))
        .map((r) => (r ? (LONG_KM_BY_ID.get(r.templateId) ?? 0) : 0));
      const peak = Math.max(...longs);
      // The first week AT the peak tier is the last ramp week or a week
      // within one tier step of it: the curve reaches the ceiling, it does
      // not sit on it for six weeks.
      const firstAtPeak = longs.indexOf(peak);
      const weeksAtPeak = longs.filter((k) => k === peak).length;
      expect(
        weeksAtPeak,
        `pace ${pace}: weeks at peak ${peak}`
      ).toBeGreaterThanOrEqual(1);
      // A coarse ladder near the ceiling (15 → 20 km at 7:00/km) spends
      // longer at the top than a fine one; the property is "not flat for
      // the whole second half", not a fixed count.
      expect(
        weeksAtPeak,
        `pace ${pace}: weeks at peak ${peak}`
      ).toBeLessThanOrEqual(Math.ceil(longs.length / 2));
      expect(firstAtPeak).toBeGreaterThan(longs.length / 2);
    }
  });

  it("bigger never peaks below standard (both clamp to the same ceiling)", () => {
    for (const pace of [null, 300, 420]) {
      const std = longRunKmForWeek({
        weekIndex: 14,
        totalWeeks: 20,
        baseLongKm: 14,
        peakLongKm: 32,
        taperWeeks: 3,
        volume: "standard",
        easyPaceSPerKm: pace,
      });
      const big = longRunKmForWeek({
        weekIndex: 14,
        totalWeeks: 20,
        baseLongKm: 14,
        peakLongKm: 32,
        taperWeeks: 3,
        volume: "bigger",
        easyPaceSPerKm: pace,
      });
      expect(big).toBeGreaterThanOrEqual(std);
    }
  });
});

describe("the WEEK progresses, not just the long run", () => {
  it("a 10K plan is no longer 27 identical weeks", () => {
    // The measurement that prompted this: with a ladder starting at 10 km and
    // a fixed easy_30, every 10K week was `easy_30 ×3 + long_10k` = 145 min,
    // for 27 weeks. Both halves had to change — a finer ladder at the bottom
    // AND an easy run that ramps.
    const weekly = minutesPerWeek(plan({ distance: "10k", daysAhead: 200 }));
    expect(new Set(weekly).size).toBeGreaterThan(3);
    const longs = longKmPerWeek(plan({ distance: "10k", daysAhead: 200 }));
    expect(new Set(longs.filter((k) => k > 0)).size).toBeGreaterThan(1);
  });

  it("a 5K plan progresses too — the ladder floor no longer swallows it", () => {
    const longs = longKmPerWeek(plan({ distance: "5k", daysAhead: 200 }));
    expect(new Set(longs.filter((k) => k > 0)).size).toBeGreaterThan(1);
  });

  it("the long run stops being most of the week", () => {
    // Pre-fix the peak marathon week was 260 min of which the long run was
    // 170 — 65% of weekly volume in one session, which no methodology
    // programmes.
    //
    // Measured now, on a 4-run week: marathon peaks at 56%, half at 45%, 10K
    // at 33%, 5K at 28%. Daniels' rule is 25-30%, so the short races are
    // inside it and the marathon is not. Be honest about that rather than
    // asserting a number the code doesn't hit: a 25 km long run IS half the
    // week when the other three runs are 40-50 minutes, and the fix for that
    // is more run days — the user's `weekSchedule` to give, not the
    // scheduler's to invent. What the scheduler owes is that the share stops
    // GROWING with distance beyond the point of absurdity, which is what
    // these bounds hold.
    const shares = Object.fromEntries(
      DISTANCES.map((d) => [
        d,
        Math.max(...longSharePerWeek(plan({ distance: d, daysAhead: 200 }))),
      ])
    ) as Record<(typeof DISTANCES)[number], number>;
    expect(shares["5k"]).toBeLessThan(0.35);
    expect(shares["10k"]).toBeLessThan(0.4);
    expect(shares.half).toBeLessThan(0.5);
    expect(shares.marathon).toBeLessThan(0.6);
  });

  it("the EASY runs themselves progress, not just total volume", () => {
    // Written first as `peak weekly minutes > 1.5x the first week`, which
    // passed with the easy runs pinned at 30 forever — the long run alone
    // moves total volume that far. Mutation-testing caught it. The claim in
    // the name is about the easy runs, so assert that: more than one easy
    // tier is prescribed, and the longest of them exceeds the base.
    const easyMinutes = new Set<number>();
    for (const d of plan({
      distance: "marathon",
      daysAhead: 200,
    }).weeks.flat()) {
      const t = RUN_TEMPLATES.find((x) => x.id === d.templateId);
      if (t?.type === "easy") easyMinutes.add(t.estimatedDuration);
    }
    expect(easyMinutes.size).toBeGreaterThan(1);
    expect(Math.max(...easyMinutes)).toBeGreaterThan(Math.min(...easyMinutes));
  });

  it("total weekly volume rises across a block", () => {
    const weekly = minutesPerWeek(
      plan({ distance: "marathon", daysAhead: 200 })
    );
    // Ignore the taper/race tail; compare the first ramp week to the peak.
    const first = weekly[0];
    const peak = Math.max(...weekly.slice(0, weekly.length - 4));
    expect(peak).toBeGreaterThan(first * 1.5);
  });

  it("easy runs ramp on the SAME cutbacks as the long run", () => {
    // A cutback that only steps the long run back is a redistribution, not a
    // cutback. Both must dip in the same week.
    const args = { totalWeeks: 24, taperWeeks: 3, volume: "standard" as const };
    for (let w = 1; w < 18; w++) {
      const easyDown =
        easyRunMinutesForWeek({ ...args, weekIndex: w }) <
        easyRunMinutesForWeek({ ...args, weekIndex: w - 1 });
      const longDown =
        longRunKmForWeek({
          ...args,
          weekIndex: w,
          baseLongKm: 14,
          peakLongKm: 32,
        }) <
        longRunKmForWeek({
          ...args,
          weekIndex: w - 1,
          baseLongKm: 14,
          peakLongKm: 32,
        });
      expect(easyDown, `week ${w}`).toBe(longDown);
    }
  });

  it("the taper cuts easy volume back to base rather than carrying the peak in", () => {
    const p = plan({ distance: "marathon", daysAhead: 200 });
    const weekly = minutesPerWeek(p);
    const peak = Math.max(...weekly.slice(0, weekly.length - 4));
    // The last three non-race weeks are the taper.
    for (const wk of weekly.slice(weekly.length - 4, weekly.length - 1)) {
      expect(wk).toBeLessThan(peak * 0.6);
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
