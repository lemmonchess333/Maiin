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
// The 1 km repeats at the interval band: a 10K's sharpener runs its 1 km
// repeats at 10K pace (Run24 (5)).
const INTERVAL_REPS = new Map(
  RUN_TEMPLATES.filter(
    (t) =>
      t.type === "intervals" &&
      t.config.intervals?.workDistance === 1000 &&
      !t.config.repeatsAt
  ).map((t) => [t.id, t.config.intervals!.reps])
);

/* Run24 (5): a build's quality sessions take turns through the session
   library's families, each a ladder on its flavour's rung, so a session's
   size is its rung, in the classic session's units: a tempo's 20, 30 or 40
   minutes, 4, 5 or 6 repeats. A family of two holds one session on two
   rungs; it reads at the lower (the first rung it can be) for sizes and
   the first rung, and the climb check reads both. */
const LIBRARY_RUNGS: Record<"tempo" | "intervals", string[][]> = {
  tempo: [
    ["tempo_20", "tempo_30", "tempo_40"],
    ["cruise_3x8", "cruise_3x10", "cruise_3x10"],
    ["progression_40", "progression_50", "progression_60"],
  ],
  intervals: [
    ["4x1k", "5x1k", "6x1k"],
    ["6x2min", "5x3min", "4x4min"],
    ["8x200", "10x200", "12x200"],
    ["5k_pace_4x800", "5k_pace_5x800", "5k_pace_6x800"],
    ["10k_pace_3x2k", "10k_pace_3x2k", "10k_pace_4x2k"],
    ["hills_6x60s", "hills_8x60s", "hills_10x60s"],
  ],
};
const UNITS = { tempo: [20, 30, 40], intervals: [4, 5, 6] };
/** A build session's rungs on its flavour's ladder, lowest and highest. */
function rungsOf(
  id: string,
  flavour: "tempo" | "intervals"
): { low: number; high: number } | null {
  const ladder = LIBRARY_RUNGS[flavour].find((l) => l.includes(id));
  return ladder
    ? { low: ladder.indexOf(id), high: ladder.lastIndexOf(id) }
    : null;
}
const sizeOf = (id: string, flavour: "tempo" | "intervals") => {
  const rungs = rungsOf(id, flavour);
  return rungs ? UNITS[flavour][rungs.low] : undefined;
};

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
  return emitted(distance)
    .map((id) => sizeOf(id, flavour))
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
    // Run24 (3) and (5): a block is capped at 16 to 20 weeks and its
    // tempo rungs are shared by tempos, cruise intervals and progression
    // runs, so a standard plan's tempos meet the 30-minute rung only as a
    // cruise; a harder plan, with its second quality session, runs it.
    const all = new Set(
      DISTANCES.flatMap((d) => [
        ...emitted(d),
        ...plan({ distance: d, daysAhead: 200, difficulty: "harder" })
          .weeks.flat()
          .map((day) => day.templateId),
      ])
    );
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

  it("volume ramps monotonically to the peak", () => {
    // Not a formula check: read the emitted sizes for one flavour and
    // require the peak every distance builds to. It used to require the
    // peak MORE THAN ONCE (one exposure at peak quality is a test, not a
    // stimulus); Run24 (4)'s time trials take a quality week in five, half
    // of them interval weeks, so the intervals now reach their peak in the
    // last build week. A trade the lock made: the paces those sessions run
    // at come from the trials.
    for (const distance of DISTANCES) {
      const sizes = qualitySizes(distance, "intervals");
      expect(Math.max(...sizes), distance).toBe(6);
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
    const ids = plan({ distance, daysAhead })
      .weeks.flat()
      .map((d) => d.templateId)
      .filter((id) => rungsOf(id, flavour) !== null);
    const sizes = ids.map((id) => sizeOf(id, flavour)!);
    return { ids, sizes, first: sizes[0] };
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
    for (const distance of DISTANCES) {
      for (const daysAhead of [70, 112, 200, 364]) {
        for (const flavour of ["tempo", "intervals"] as const) {
          const { ids } = firstAndSteps(distance, daysAhead, flavour);
          let highest = -1;
          for (const id of ids) {
            const { low, high } = rungsOf(id, flavour)!;
            expect(
              low - highest,
              `${distance} ${daysAhead}d ${flavour}: ${ids.join(",")}`
            ).toBeLessThanOrEqual(1);
            highest = Math.max(highest, Math.min(high, highest + 1));
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
