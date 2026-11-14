/**
 * Run24 (5), deep dive D5: the plan holds the session library. A build's
 * quality sessions are chosen by race distance, its base holds light
 * quality, its taper the distance's own sharpener, and a regular runner on
 * five run days or more holds a second quality session by default.
 */
import { describe, expect, it } from "vitest";
import { generateRacePlanV2, type RacePlanV2Input } from "../runScheduler";
import { getPhaseForWeek } from "../runPlanTiming";
import { newRunnerUntil } from "../newRunner";
import type { RunningBaseline } from "../runningBaseline";
import { generateSchedule } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

const START = "2026-03-09";
type Distance = RacePlanV2Input["raceGoal"]["distance"];

const regular = (weeklyMinutes: number, longest: number): RunningBaseline => ({
  version: 1,
  experience: "regular",
  weeklyMinutes,
  longestRunMinutes: longest,
  confirmedAt: "2026-03-01",
  source: "self_reported",
});

function plan(
  distance: Distance,
  weeks: number,
  runDays = 4,
  more: Partial<RacePlanV2Input> = {}
) {
  return generateRacePlanV2({
    recentLayoff: "none",
    weekSchedule: generateSchedule(0, runDays),
    weeklyRunDays: runDays,
    raceGoal: {
      distance,
      targetDate: localDateString(
        addLocalDays(parseLocalDate(START), weeks * 7 - 1)
      ),
    },
    currentDate: START,
    weekStart: START,
    easyPaceSPerKm: 360,
    ...more,
  });
}

const template = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;
const isQuality = (id: string) =>
  ["tempo", "intervals"].includes(template(id).type);
const phaseOf = (distance: Distance, weeks: number, w: number) =>
  getPhaseForWeek(w, weeks, distance);
const idsIn = (
  out: ReturnType<typeof plan>,
  distance: Distance,
  weeks: number,
  phase: string
) =>
  out.weeks.flatMap((week, w) =>
    phaseOf(distance, weeks, w) === phase
      ? week.map((run) => run.templateId)
      : []
  );

/** Each library ladder on the flavour's three rungs, for a climb's check:
 *  a family of two sessions holds one of them on two rungs. */
const LADDERS = [
  ["tempo_20", "tempo_30", "tempo_40"],
  ["cruise_3x8", "cruise_3x10", "cruise_3x10"],
  ["progression_40", "progression_50", "progression_60"],
  ["4x1k", "5x1k", "6x1k"],
  ["6x2min", "5x3min", "4x4min"],
  ["8x200", "10x200", "12x200"],
  ["5k_pace_4x800", "5k_pace_5x800", "5k_pace_6x800"],
  ["10k_pace_3x2k", "10k_pace_3x2k", "10k_pace_4x2k"],
  ["hills_6x60s", "hills_8x60s", "hills_10x60s"],
];

describe("a build's quality sessions, by race distance (Run24 (5))", () => {
  // A regular runner on six days holds two a week, so every family's turn
  // comes round in one block.
  const sixDays = (distance: Distance, weeks: number) =>
    plan(distance, weeks, 6, { runningBaseline: regular(240, 80) });

  it("give a 5K repeats at 5K pace and short repeats at repetition pace", () => {
    const build = idsIn(sixDays("5k", 14), "5k", 14, "build");
    expect(build.some((id) => id.startsWith("5k_pace_"))).toBe(true);
    expect(build.some((id) => /^\d+x200$/.test(id))).toBe(true);
    // A 5K's threshold work stays under its 20-minute ceiling.
    expect(build.filter((id) => id.startsWith("cruise_"))).toEqual([]);
    expect(build.filter((id) => /^tempo_[34]0$/.test(id))).toEqual([]);
  });

  it("give a 10K repeats at 10K pace and cruise intervals", () => {
    const build = idsIn(sixDays("10k", 14), "10k", 14, "build");
    expect(build.some((id) => id.startsWith("10k_pace_"))).toBe(true);
    expect(build.some((id) => id.startsWith("cruise_"))).toBe(true);
    expect(build.some((id) => id.startsWith("5k_pace_"))).toBe(false);
  });

  it("give a half and a marathon cruise intervals, progression runs, repeats by time and hills", () => {
    for (const distance of ["half", "marathon"] as const) {
      const build = idsIn(sixDays(distance, 18), distance, 18, "build");
      for (const family of ["cruise_", "progression_", "hills_", "min"])
        expect(
          build.some((id) => id.includes(family)),
          `${distance}: ${family}`
        ).toBe(true);
      // No short-race pace sessions in a long race's build.
      expect(build.some((id) => /^(5k|10k)_pace_|x200$/.test(id))).toBe(false);
    }
  });

  it("start each ladder at its first rung and climb one rung at a time", () => {
    for (const [distance, weeks] of [
      ["5k", 14],
      ["10k", 14],
      ["half", 18],
      ["marathon", 20],
    ] as const) {
      const out = sixDays(distance, weeks);
      const highest = new Map<"tempo" | "intervals", number>();
      out.weeks.forEach((week, w) => {
        if (phaseOf(distance, weeks, w) !== "build") return;
        for (const run of week) {
          if (run.type !== "tempo" && run.type !== "intervals") continue;
          const ladder = LADDERS.find((l) => l.includes(run.templateId));
          if (!ladder) continue;
          // A session on two rungs is read low against the rung before it
          // and high as the next one's rung before.
          const lowest = ladder.indexOf(run.templateId);
          const most = ladder.lastIndexOf(run.templateId);
          const before = highest.get(run.type) ?? -1;
          expect(
            lowest,
            `${distance} week ${w + 1}: ${run.templateId}`
          ).toBeLessThanOrEqual(before + 1);
          highest.set(run.type, Math.max(before, Math.min(most, before + 1)));
        }
      });
    }
  });
});

describe("a base week's light quality (Run24 (5))", () => {
  it("is a fartlek or short hills, in place of all easy", () => {
    for (const distance of ["5k", "10k", "half", "marathon"] as const) {
      const weeks = distance === "marathon" ? 18 : 14;
      const out = plan(distance, weeks, 4);
      const baseWeeks = out.weeks.filter(
        (_, w) => phaseOf(distance, weeks, w) === "base"
      );
      expect(baseWeeks.length).toBeGreaterThan(0);
      for (const week of baseWeeks) {
        const quality = week.filter((run) => isQuality(run.templateId));
        // One light session, or the week's time trial in its place.
        expect(quality.map((run) => run.templateId)).toHaveLength(1);
        expect(quality[0].templateId).toMatch(
          /^(fartlek_30|hills_6x30s|time_trial_[35]k)$/
        );
      }
    }
  });

  it("keeps the medium-long and the long run beside it", () => {
    const out = plan("half", 16, 3);
    const first = out.weeks[0].map((run) => run.templateId);
    expect(first).toContain("fartlek_30");
    expect(first.filter((id) => id.startsWith("long_"))).toHaveLength(1);
    expect(first.filter((id) => id.startsWith("easy_"))).toHaveLength(1);
  });

  it("is not held on two run days, nor where a build would hold none", () => {
    const light = (out: ReturnType<typeof plan>) =>
      out.weeks
        .flat()
        .filter((run) => /^(fartlek_30|hills_6x30s)$/.test(run.templateId));
    expect(light(plan("half", 16, 2))).toEqual([]);
    expect(light(plan("half", 16, 4, { recentLayoff: "detrained" }))).toEqual(
      []
    );
    expect(
      light(
        plan("half", 16, 4, {
          tuning: { volume: "standard", difficulty: "gentler" },
        })
      )
    ).toEqual([]);
    // A block begun as a new runner holds strides until they have run 40
    // minutes in one go (Run24 (8)).
    expect(
      light(
        plan("half", 20, 3, {
          newRunnerUntil: newRunnerUntil("new", START),
          easyPaceSPerKm: undefined,
        })
      )
    ).toEqual([]);
  });
});

describe("the taper's sharpener (Run24 (5))", () => {
  it("is the distance's own, never 8 x 400 m for every race", () => {
    const sharpener = {
      "5k": "sharpener_5k",
      "10k": "sharpener_10k",
      half: "sharpener_half",
      marathon: "sharpener_marathon",
    } as const;
    for (const distance of ["5k", "10k", "half", "marathon"] as const) {
      const weeks = distance === "marathon" ? 18 : 14;
      const out = plan(distance, weeks, 4);
      const taper = idsIn(out, distance, weeks, "taper");
      expect(taper, distance).toContain(sharpener[distance]);
      expect(out.weeks.flat().map((run) => run.templateId)).not.toContain(
        "8x400"
      );
      const run = out.weeks
        .flat()
        .find((r) => r.templateId === sharpener[distance])!;
      expect(run.type).toBe(template(sharpener[distance]).type);
    }
  });
});

describe("a second quality session by default (Run24 (5))", () => {
  const twoQualityWeeks = (out: ReturnType<typeof plan>) =>
    out.weeks.filter(
      (week) => week.filter((run) => isQuality(run.templateId)).length === 2
    ).length;

  it("for a regular runner on five run days or more", () => {
    expect(
      twoQualityWeeks(
        plan("marathon", 18, 5, { runningBaseline: regular(300, 120) })
      )
    ).toBeGreaterThan(0);
    expect(
      twoQualityWeeks(plan("10k", 14, 6, { runningBaseline: regular(240, 80) }))
    ).toBeGreaterThan(0);
  });

  it("not on four run days, nor for a runner still building, nor gentler", () => {
    expect(
      twoQualityWeeks(
        plan("marathon", 18, 4, { runningBaseline: regular(300, 120) })
      )
    ).toBe(0);
    expect(
      twoQualityWeeks(
        plan("marathon", 18, 5, {
          runningBaseline: { ...regular(300, 120), experience: "building" },
        })
      )
    ).toBe(0);
    expect(
      twoQualityWeeks(
        plan("marathon", 18, 5, {
          runningBaseline: regular(300, 120),
          tuning: { volume: "standard", difficulty: "gentler" },
        })
      )
    ).toBe(0);
    expect(twoQualityWeeks(plan("marathon", 18, 5))).toBe(0);
  });
});
