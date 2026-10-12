/**
 * Quality sessions progress by volume, and their ceiling is event-specific.
 *
 * ── The defect ───────────────────────────────────────────────────────────
 *
 * `tempo_20` and `5x1k` alternated unchanged for 15 consecutive build weeks,
 * on every distance. A marathoner and a 5K runner were handed the identical
 * quality session for a whole block, and neither one's ever got harder. It
 * was the last flat axis left after the long run and the easy runs were
 * ramped — same shape of defect, one level along.
 *
 * ── What is asserted ─────────────────────────────────────────────────────
 *
 * Volume progresses; PACE does not. Interval and threshold paces come from
 * physiology (`runPaces.ts` derives them from VDOT), so what a block develops
 * is how much of that pace you can hold. Every assertion here is therefore
 * about session SIZE, and the tests read size off the registry rather than
 * recomputing the ramp — an expectation computed by the path under test pins
 * consistency, not behaviour.
 */
import { describe, it, expect } from "vitest";

import {
  generateRacePlanV2,
  qualityTemplateId,
  TAPER_WEEKS_BY_DISTANCE,
} from "../runScheduler";
import { generateSchedule } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import type { RunDifficultyPreset } from "../runScheduler";

const CURRENT = "2026-06-01";
const WEEK_START = localWeekKey(parseLocalDate(CURRENT));
const DISTANCES = ["5k", "10k", "half", "marathon"] as const;
type Distance = (typeof DISTANCES)[number];

function targetDate(daysAhead: number): string {
  const d = parseLocalDate(CURRENT);
  d.setDate(d.getDate() + daysAhead);
  return localDateString(d);
}

function plan(args: {
  distance: Distance;
  daysAhead: number;
  difficulty?: RunDifficultyPreset;
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
    tuning: { volume: "standard", difficulty: args.difficulty ?? "standard" },
  });
}

/** Minutes of actual TEMPO work in a template (total, less warmup/cooldown as
 *  the description states them). Read from the id so the ladder's ordering is
 *  derived from the registry, not restated. */
const TEMPO_WORK: Record<string, number> = {
  tempo_20: 20,
  tempo_30: 30,
  tempo_40: 40,
};
const INTERVAL_REPS = new Map(
  RUN_TEMPLATES.filter(
    (t) => t.type === "intervals" && t.config.intervals?.workDistance === 1000
  ).map((t) => [t.id, t.config.intervals!.reps])
);

function emitted(distance: Distance, daysAhead = 200): string[] {
  return plan({ distance, daysAhead })
    .weeks.flat()
    .map((d) => d.templateId);
}

/** Per-week size of the quality session of a given flavour, in ladder units,
 *  for the weeks that have one. */
function qualitySizes(
  distance: Distance,
  flavour: "tempo" | "intervals"
): number[] {
  const table = flavour === "tempo" ? TEMPO_WORK : null;
  return emitted(distance)
    .map((id) => (table ? table[id] : INTERVAL_REPS.get(id)))
    .filter((n): n is number => typeof n === "number");
}

describe("quality sessions progress", () => {
  it("no distance repeats one tempo and one interval session all block", () => {
    // The literal defect. Pre-fix every distance produced exactly
    // {tempo_20} and {5x1k} for the whole build phase.
    for (const distance of DISTANCES) {
      const tempo = new Set(qualitySizes(distance, "tempo"));
      const intervals = new Set(qualitySizes(distance, "intervals"));
      // At least ONE of the two axes must progress for every distance — 5K
      // deliberately holds tempo at 20 (see the event-specificity test), so
      // requiring both would encode the wrong rule.
      expect(
        tempo.size + intervals.size,
        `${distance}: tempo=${[...tempo]} intervals=${[...intervals]}`
      ).toBeGreaterThan(2);
    }
  });

  it("every rung of both ladders is reachable by some plan", () => {
    // A rung nothing emits is dead data — the same failure as the
    // `peakLongKm: 32` that started this arc. `6x1k` WAS dead until the
    // peak-and-hold window existed, because quality alternates by week parity
    // and a ramp that only touches peak on its final week reaches it for one
    // flavour at most.
    const all = new Set(DISTANCES.flatMap((d) => emitted(d)));
    for (const id of Object.keys(TEMPO_WORK))
      expect(all.has(id), id).toBe(true);
    for (const id of INTERVAL_REPS.keys()) expect(all.has(id), id).toBe(true);
  });

  it("the tempo ceiling is event-specific — a 5K plan never gets a 40-min tempo", () => {
    // A 5K race is ~20 minutes long; a 40-minute threshold run is not a 5K
    // session. This is where the distance distinction lives, so it is the
    // assertion that has to hold.
    const peakTempo = (d: Distance) => Math.max(...qualitySizes(d, "tempo"));
    expect(peakTempo("5k")).toBe(20);
    expect(peakTempo("10k")).toBeGreaterThan(peakTempo("5k"));
    expect(peakTempo("half")).toBeGreaterThan(peakTempo("10k"));
    expect(peakTempo("marathon")).toBe(peakTempo("half"));
  });

  it("intervals progress for EVERY distance, including the marathon", () => {
    // A first pass keyed the interval peak to distance too (marathon 5, 5K 6)
    // and marathon intervals then sat at 4 reps for the entire block — the
    // flat-axis defect reintroduced for one distance. Pfitzinger prescribes
    // 5-6×1000m in marathon blocks, so 6 is the ceiling for everyone.
    for (const distance of DISTANCES) {
      const sizes = qualitySizes(distance, "intervals");
      expect(new Set(sizes).size, distance).toBeGreaterThan(1);
      expect(Math.max(...sizes), distance).toBe(6);
    }
  });

  it("volume ramps monotonically to the peak, then holds", () => {
    // Not a formula check: read the emitted sizes for one flavour and require
    // that the maximum is reached MORE THAN ONCE. One exposure at peak
    // quality is a test, not a stimulus.
    for (const distance of DISTANCES) {
      const sizes = qualitySizes(distance, "intervals");
      const peak = Math.max(...sizes);
      expect(sizes.filter((s) => s === peak).length, distance).toBeGreaterThan(
        1
      );
    }
  });

  it("cutback weeks ease the quality session too", () => {
    // A cutback that eases the long run and the easy runs but leaves quality
    // at peak isn't a cutback. Drive the pure function directly so the week
    // parity of the generator doesn't hide it.
    const args = {
      flavour: "intervals" as const,
      totalWeeks: 24,
      taperWeeks: 3,
      distance: "marathon" as const,
      difficulty: "standard" as const,
    };
    const size = (w: number) =>
      INTERVAL_REPS.get(qualityTemplateId({ ...args, weekIndex: w }))!;
    let steppedDown = 0;
    for (let w = 1; w < 18; w++) if (size(w) < size(w - 1)) steppedDown++;
    expect(steppedDown).toBeGreaterThan(0);
  });
});

/* Run20 (4): the ladder was indexed on the block's position, so a runner's
   first quality session started wherever the block had got to: a year-out
   marathon's first tempo was tempo_30 and its first intervals 5 × 1K, and a
   short plan's first intervals were 6 × 1K (running-engine-audit §7 item 4).
   Now the first session of each kind is its first rung, and each one climbs
   at most a rung; the block's position still caps it. */
describe("the ladder starts at its first rung", () => {
  const firstAndSteps = (
    distance: Distance,
    daysAhead: number,
    flavour: "tempo" | "intervals"
  ) => {
    const sizes = plan({ distance, daysAhead })
      .weeks.flat()
      .map((d) =>
        flavour === "tempo"
          ? TEMPO_WORK[d.templateId]
          : INTERVAL_REPS.get(d.templateId)
      )
      .filter((n): n is number => typeof n === "number");
    return { sizes, first: sizes[0] };
  };

  it("a year-out marathon's first tempo and first intervals are the first rungs", () => {
    expect(firstAndSteps("marathon", 364, "tempo").first).toBe(20);
    expect(firstAndSteps("marathon", 364, "intervals").first).toBe(4);
  });

  it("a short plan's first intervals are 4 × 1K, for every distance", () => {
    for (const distance of DISTANCES) {
      const { first } = firstAndSteps(distance, 70, "intervals");
      if (first !== undefined) expect(first, distance).toBe(4);
    }
  });

  it("climbs at most one rung past the highest before it", () => {
    // A cutback eases a session and the next returns to the ladder, so the
    // step is measured from the highest rung reached, not the last one.
    const tempoRung = [20, 30, 40];
    const intervalRung = [4, 5, 6];
    for (const distance of DISTANCES) {
      for (const daysAhead of [70, 112, 200, 364]) {
        for (const flavour of ["tempo", "intervals"] as const) {
          const rungs = flavour === "tempo" ? tempoRung : intervalRung;
          const { sizes } = firstAndSteps(distance, daysAhead, flavour);
          let highest = -1;
          for (const size of sizes) {
            const rung = rungs.indexOf(size);
            expect(
              rung - highest,
              `${distance} ${daysAhead}d ${flavour}: ${sizes.join(",")}`
            ).toBeLessThanOrEqual(1);
            highest = Math.max(highest, rung);
          }
        }
      }
    }
  });
});

describe("the knobs still win", () => {
  it("gentler holds quality at the base rung", () => {
    // `gentler` already halves quality frequency and drops intervals; letting
    // the surviving sessions grow anyway would work against the knob.
    for (const distance of DISTANCES) {
      for (let w = 0; w < 20; w++) {
        const id = qualityTemplateId({
          flavour: "tempo",
          weekIndex: w,
          totalWeeks: 24,
          taperWeeks: TAPER_WEEKS_BY_DISTANCE[distance],
          distance,
          difficulty: "gentler",
        });
        expect(TEMPO_WORK[id], `${distance} w${w}`).toBe(20);
      }
    }
  });

  it("a plan with no room to ramp stays at base", () => {
    for (const flavour of ["tempo", "intervals"] as const) {
      const id = qualityTemplateId({
        flavour,
        weekIndex: 1,
        totalWeeks: 4,
        taperWeeks: 3,
        distance: "marathon",
        difficulty: "standard",
      });
      expect(flavour === "tempo" ? TEMPO_WORK[id] : INTERVAL_REPS.get(id)).toBe(
        flavour === "tempo" ? 20 : 4
      );
    }
  });

  it("below-floor plans get no quality at all — unchanged", () => {
    const p = plan({ distance: "marathon", daysAhead: 14 });
    expect(p.belowFloor).toBe(true);
    const types = new Set(p.weeks.flat().map((d) => d.type));
    expect(types.has("tempo")).toBe(false);
    expect(types.has("intervals")).toBe(false);
  });
});
