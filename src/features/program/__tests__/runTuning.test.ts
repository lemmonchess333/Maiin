/**
 * Pgm6 — run-plan tuning knobs (locked 2026-07-04: exactly two knobs,
 * volume preset + difficulty; no mileage cap, no free-form dials).
 *
 * The invariants pinned here are the ones that keep the knobs SAFE in a
 * correctness-critical engine:
 *
 *   1. `standard`/`standard` (and absent tuning) is BYTE-IDENTICAL to the
 *      pre-Pgm6 output — existing users' plans cannot shift under them.
 *   2. Safety rules always beat the knobs: below-floor plans ignore
 *      "bigger"; compressed plans ignore "harder". Conservative knobs
 *      ("lighter"/"gentler") are always honoured.
 *   3. Each knob does exactly what its settings copy claims and nothing
 *      else (volume touches only long-run tier; difficulty touches only
 *      quality composition).
 */
import { describe, it, expect } from "vitest";
import {
  generateRacePlanV2,
  runTuningFromProfile,
  DEFAULT_RUN_TUNING,
  type RunTuning,
} from "../runScheduler";
import { buildPlan } from "../planBuilder";
import { generateSchedule } from "@/lib/scheduleUtils";
import {
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";

const CURRENT = "2026-06-01";
const WEEK_START = localWeekKey(parseLocalDate(CURRENT));

function targetDate(daysAhead: number): string {
  const d = parseLocalDate(CURRENT);
  d.setDate(d.getDate() + daysAhead);
  return localDateString(d);
}

function plan(args: {
  distance: "5k" | "10k" | "half" | "marathon";
  daysAhead: number;
  runDays?: number;
  liftDays?: number;
  tuning?: RunTuning;
}) {
  return generateRacePlanV2({
    weekSchedule: generateSchedule(args.liftDays ?? 2, args.runDays ?? 3),
    raceGoal: {
      distance: args.distance,
      targetDate: targetDate(args.daysAhead),
    },
    weeklyRunDays: args.runDays ?? 3,
    currentDate: CURRENT,
    weekStart: WEEK_START,
    tuning: args.tuning,
  });
}

const allDays = (p: { weeks: { templateId: string; type: string }[][] }) =>
  p.weeks.flat();

describe("Pgm6 — default equivalence (invariant 1)", () => {
  const DISTANCES = ["5k", "10k", "half", "marathon"] as const;
  const HORIZONS = [10, 30, 60, 120];

  it("absent tuning === explicit standard/standard, for every distance × horizon", () => {
    for (const distance of DISTANCES) {
      for (const daysAhead of HORIZONS) {
        const untuned = plan({ distance, daysAhead });
        const standard = plan({
          distance,
          daysAhead,
          tuning: { volume: "standard", difficulty: "standard" },
        });
        expect(standard).toEqual(untuned);
      }
    }
  });
});

describe("Pgm6 — volume knob", () => {
  it("lighter caps every long run at the 10K tier (marathon, healthy plan)", () => {
    const p = plan({
      distance: "marathon",
      daysAhead: 120,
      tuning: { volume: "lighter", difficulty: "standard" },
    });
    expect(allDays(p).some((d) => d.templateId === "long_15k")).toBe(false);
    // Still a real plan — long runs exist, just smaller.
    expect(allDays(p).some((d) => d.templateId === "long_10k")).toBe(true);
  });

  it("bigger unlocks the 15K tier for a 10K plan (standard keeps it at 10K)", () => {
    const standard = plan({ distance: "10k", daysAhead: 60 });
    expect(allDays(standard).some((d) => d.templateId === "long_15k")).toBe(
      false
    );
    const bigger = plan({
      distance: "10k",
      daysAhead: 60,
      tuning: { volume: "bigger", difficulty: "standard" },
    });
    expect(allDays(bigger).some((d) => d.templateId === "long_15k")).toBe(true);
  });

  it("bigger does NOT inflate a 5K plan (peak 8km stays under the bigger threshold)", () => {
    const p = plan({
      distance: "5k",
      daysAhead: 60,
      tuning: { volume: "bigger", difficulty: "standard" },
    });
    expect(allDays(p).some((d) => d.templateId === "long_15k")).toBe(false);
  });

  it("bigger is IGNORED below the taper-safe floor — finish-safely never inflates (invariant 2)", () => {
    // Marathon 2 weeks out → belowFloor. baseLongKm=14 would clear the
    // bigger threshold (10) if the clamp were missing.
    const standard = plan({ distance: "marathon", daysAhead: 14 });
    const bigger = plan({
      distance: "marathon",
      daysAhead: 14,
      tuning: { volume: "bigger", difficulty: "standard" },
    });
    expect(standard.belowFloor).toBe(true);
    expect(bigger).toEqual(standard);
  });

  it("volume never touches quality composition", () => {
    const standard = plan({ distance: "half", daysAhead: 90 });
    const lighter = plan({
      distance: "half",
      daysAhead: 90,
      tuning: { volume: "lighter", difficulty: "standard" },
    });
    const qualityOf = (p: typeof standard) =>
      allDays(p)
        .filter((d) => d.type === "tempo" || d.type === "intervals")
        .map((d) => d.templateId);
    expect(qualityOf(lighter)).toEqual(qualityOf(standard));
  });
});

describe("Pgm6 — difficulty knob", () => {
  it("gentler schedules NO intervals anywhere — tempo-only quality, taper sharpener dropped", () => {
    const p = plan({
      distance: "half",
      daysAhead: 90,
      tuning: { volume: "standard", difficulty: "gentler" },
    });
    expect(allDays(p).some((d) => d.type === "intervals")).toBe(false);
    expect(allDays(p).some((d) => d.templateId === "8x400")).toBe(false);
    // Quality still exists (every other build week), just gentler.
    expect(allDays(p).some((d) => d.type === "tempo")).toBe(true);
  });

  it("gentler halves build quality: at most every other build week carries a quality session", () => {
    const standard = plan({ distance: "marathon", daysAhead: 120 });
    const gentler = plan({
      distance: "marathon",
      daysAhead: 120,
      tuning: { volume: "standard", difficulty: "gentler" },
    });
    const qualityWeeks = (p: typeof standard) =>
      p.weeks.filter((w) =>
        w.some((d) => d.type === "tempo" || d.type === "intervals")
      ).length;
    expect(qualityWeeks(gentler)).toBeLessThan(qualityWeeks(standard));
  });

  it("harder adds a second quality session to build weeks with a spare slot", () => {
    const standard = plan({ distance: "marathon", daysAhead: 120, runDays: 4 });
    const harder = plan({
      distance: "marathon",
      daysAhead: 120,
      runDays: 4,
      tuning: { volume: "standard", difficulty: "harder" },
    });
    const maxQualityInAWeek = (p: typeof standard) =>
      Math.max(
        ...p.weeks.map(
          (w) =>
            w.filter((d) => d.type === "tempo" || d.type === "intervals").length
        )
      );
    expect(maxQualityInAWeek(standard)).toBe(1);
    expect(maxQualityInAWeek(harder)).toBe(2);
    // A harder build week carries BOTH flavours, not a duplicate.
    const doubleWeek = harder.weeks.find(
      (w) =>
        w.filter((d) => d.type === "tempo" || d.type === "intervals").length ===
        2
    );
    const types = (doubleWeek ?? [])
      .filter((d) => d.type === "tempo" || d.type === "intervals")
      .map((d) => d.type)
      .sort();
    expect(types).toEqual(["intervals", "tempo"]);
  });

  it("harder is IGNORED on compressed plans — safety caps win (invariant 2)", () => {
    // Half 5 weeks out: below minWeeks (8), above floor (3) → compressed.
    const standard = plan({ distance: "half", daysAhead: 35 });
    const harder = plan({
      distance: "half",
      daysAhead: 35,
      tuning: { volume: "standard", difficulty: "harder" },
    });
    expect(standard.compressed).toBe(true);
    expect(standard.belowFloor).toBe(false);
    expect(harder).toEqual(standard);
  });

  it("harder never adds taper or race-week work — arrive fresh", () => {
    const harder = plan({
      distance: "10k",
      daysAhead: 60,
      runDays: 4,
      tuning: { volume: "standard", difficulty: "harder" },
    });
    const standard = plan({ distance: "10k", daysAhead: 60, runDays: 4 });
    // Compare the final two weeks (taper + race) verbatim.
    expect(harder.weeks.slice(-2)).toEqual(standard.weeks.slice(-2));
  });
});

describe("Pgm6 — runTuningFromProfile", () => {
  it("missing or foreign values fall back to standard (lazy default, no migration)", () => {
    expect(runTuningFromProfile({})).toEqual(DEFAULT_RUN_TUNING);
    expect(
      runTuningFromProfile({ runVolume: "mega", runDifficulty: "insane" })
    ).toEqual(DEFAULT_RUN_TUNING);
  });

  it("valid persisted values pass through", () => {
    expect(
      runTuningFromProfile({ runVolume: "lighter", runDifficulty: "harder" })
    ).toEqual({ volume: "lighter", difficulty: "harder" });
  });
});

describe("Pgm6 — planBuilder threading", () => {
  it("persists the knobs on profileUpdates and applies them to the generated runDays", () => {
    const out = buildPlan({
      primaryGoal: "hypertrophy",
      nutritionPhase: "recomp",
      experience: "intermediate",
      liftDays: 2,
      preferredSplit: "full_body",
      runMode: "race_prep",
      weeklyRunDays: 3,
      raceGoal: { distance: "marathon", targetDate: targetDate(120) },
      equipment: "full_gym",
      injuries: [],
      currentDate: CURRENT,
      runTuning: { volume: "lighter", difficulty: "gentler" },
    });
    expect(out.profileUpdates.runVolume).toBe("lighter");
    expect(out.profileUpdates.runDifficulty).toBe("gentler");
    // Week 0 of a lighter marathon plan carries no 15K long run.
    expect(
      (out.programState.runDays ?? []).some((d) => d.templateId === "long_15k")
    ).toBe(false);
  });

  it("defaults to standard/standard when runTuning is omitted", () => {
    const out = buildPlan({
      primaryGoal: "hypertrophy",
      nutritionPhase: "recomp",
      experience: "intermediate",
      liftDays: 2,
      preferredSplit: "full_body",
      runMode: "freeform",
      weeklyRunDays: 0,
      equipment: "full_gym",
      injuries: [],
      currentDate: CURRENT,
    });
    expect(out.profileUpdates.runVolume).toBe("standard");
    expect(out.profileUpdates.runDifficulty).toBe("standard");
  });
});
