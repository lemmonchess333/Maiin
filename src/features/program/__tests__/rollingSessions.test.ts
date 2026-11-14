/**
 * Run24 (5), deep dive D5: a plan with no race date holds the session
 * library a race block holds. Its tempo and intervals take the families for
 * the goal's distance in turn (a 10K's for keep fit), each a rung past the
 * last of its kind and no further than the goal's peak; its short reps are
 * 200s at repetition pace; its opening week and the rotation's light turns
 * hold a fartlek or short hills in turn; a new runner's plan holds none of
 * them until they have run 40 minutes in one go (Run24 (8)). The retired
 * structured week takes a 10K's families in turn too. The rolling base
 * before a race far away is the same run (`rollingPlan.test.ts`).
 */
import { describe, expect, it } from "vitest";
import {
  generateRollingPlan,
  scheduleStructuredWeekV2,
  type RunDifficultyPreset,
} from "../runScheduler";
import { ROLLING_GOALS, ROLLING_SPECS, type RollingGoal } from "../rollingPlan";
import { newRunnerUntil, NEW_RUNNER_WEEKS } from "../newRunner";
import type { ScheduledRunDay } from "../programTypes";
import { generateSchedule } from "@/lib/scheduleUtils";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

/** A Monday. */
const START = "2026-03-09";
const day = (offset: number) =>
  localDateString(addLocalDays(parseLocalDate(START), offset));

/** Each library ladder a plan with no race date draws on, by family. */
const LADDERS: Record<string, readonly string[]> = {
  tempo: ["tempo_20", "tempo_30", "tempo_40"],
  cruise: ["cruise_3x8", "cruise_3x10", "cruise_3x10"],
  progression: ["progression_40", "progression_50", "progression_60"],
  km: ["4x1k", "5x1k", "6x1k"],
  timed: ["6x2min", "5x3min", "4x4min"],
  repetition: ["8x200", "10x200", "12x200"],
  pace5k: ["5k_pace_4x800", "5k_pace_5x800", "5k_pace_6x800"],
  pace10k: ["10k_pace_3x2k", "10k_pace_3x2k", "10k_pace_4x2k"],
  hills: ["hills_6x60s", "hills_8x60s", "hills_10x60s"],
};
const LIGHT = ["fartlek_30", "hills_6x30s"];
const familyOf = (id: string) =>
  Object.keys(LADDERS).find((family) => LADDERS[family].includes(id));
const isTrial = (run: ScheduledRunDay) =>
  run.templateId.startsWith("time_trial");
const sessions = (week: ScheduledRunDay[]) =>
  week.filter(
    (run) => (run.type === "tempo" || run.type === "intervals") && !isTrial(run)
  );

function plan(
  goal: RollingGoal,
  options: {
    weeks?: number;
    runDays?: number;
    pace?: number | null;
    difficulty?: RunDifficultyPreset;
    newRunnerUntil?: string | null;
    recentRuns?: { date: string; duration: number; distance: number }[];
  } = {}
) {
  const runDays = options.runDays ?? 4;
  return generateRollingPlan({
    goal,
    weekSchedule: generateSchedule(0, runDays),
    weeklyRunDays: runDays,
    currentDate: START,
    weekStart: START,
    planWeek: 0,
    recentLayoff: "none",
    tuning: {
      volume: "standard",
      difficulty: options.difficulty ?? "standard",
    },
    easyPaceSPerKm: options.pace === undefined ? 360 : options.pace,
    newRunnerUntil: options.newRunnerUntil ?? null,
    recentRuns: options.recentRuns ?? null,
    weeks: options.weeks ?? 36,
  });
}

/** The families a plan's sessions of one kind took, in order, its light
 *  sessions aside. */
const familiesOf = (weeks: ScheduledRunDay[][], kind: "tempo" | "intervals") =>
  weeks
    .flatMap(sessions)
    .filter((run) => run.type === kind && !LIGHT.includes(run.templateId))
    .map((run) => familyOf(run.templateId));

describe("a plan with no race date takes the library's sessions in turn (Run24 (5))", () => {
  it("by the goal's distance: a 10K's for build to 10K", () => {
    const weeks = plan("build_10k");
    expect(familiesOf(weeks, "tempo").slice(0, 6)).toEqual([
      "tempo",
      "cruise",
      "progression",
      "tempo",
      "cruise",
      "progression",
    ]);
    // Intervals in a 10K's turn: 1 km repeats, 10K pace, repeats by time,
    // 200s at repetition pace.
    expect(familiesOf(weeks, "intervals").slice(0, 4)).toEqual([
      "km",
      "pace10k",
      "timed",
      "repetition",
    ]);
  });

  it("a 5K's for build to 5K and get faster at 5K, never a 10K's or cruise intervals", () => {
    const build = plan("build_5k")
      .flatMap(sessions)
      .map((r) => r.templateId);
    expect(familiesOf(plan("build_5k"), "tempo").slice(0, 4)).toEqual([
      "tempo",
      "progression",
      "tempo",
      "progression",
    ]);
    const faster = plan("faster_5k");
    // Its short reps have a turn of their own, so its intervals leave 200s
    // to it: 1 km repeats, 5K pace and repeats by time, each a rung up.
    expect(
      faster.slice(0, 14).map((week) => sessions(week).map((r) => r.templateId))
    ).toEqual([
      ["fartlek_30"],
      ["4x1k"],
      ["tempo_20"],
      [],
      ["8x200"],
      ["5k_pace_5x800"],
      [],
      [],
      ["10x200"],
      ["4x4min"],
      [],
      [],
      ["12x200"],
      ["6x1k"],
    ]);
    expect(faster[6].some(isTrial)).toBe(true);
    expect(faster[10].some(isTrial)).toBe(true);
    const fasterIds = faster.flatMap(sessions).map((r) => r.templateId);
    expect(fasterIds.some((id) => /^\d+x200$/.test(id))).toBe(true);
    for (const ids of [build, fasterIds]) {
      expect(ids.some((id) => /^(10k_pace_|cruise_)/.test(id))).toBe(false);
      expect(ids).not.toContain("8x400");
    }
  });

  it("a 10K's for keep fit, which names no distance, under its 20-minute tempo", () => {
    const weeks = plan("keep_fit");
    expect(familiesOf(weeks, "tempo").slice(0, 4)).toEqual([
      "tempo",
      "progression",
      "tempo",
      "progression",
    ]);
    const ids = weeks.flatMap(sessions).map((r) => r.templateId);
    // Its 20-minute ceiling holds no cruise intervals (3 x 8 is 24) and
    // no longer tempo; its short reps stay on their first rung.
    expect(ids.some((id) => id.startsWith("cruise_"))).toBe(false);
    expect(ids).not.toContain("tempo_30");
    expect(ids).toContain("8x200");
    expect(ids.some((id) => /^1\dx200$/.test(id))).toBe(false);
  });

  it("each on its ladder, a rung at a time, no higher than the goal's peak", () => {
    const peaks: Record<RollingGoal, { tempo: number; intervals: number }> = {
      build_5k: { tempo: 0, intervals: 0 },
      build_10k: { tempo: 1, intervals: 1 },
      faster_5k: { tempo: 0, intervals: 2 },
      keep_fit: { tempo: 0, intervals: 0 },
    };
    for (const goal of ROLLING_GOALS)
      for (const pace of [360, null]) {
        const highest = new Map<string, number>();
        plan(goal, { pace }).forEach((week, w) => {
          for (const run of sessions(week)) {
            const family = familyOf(run.templateId);
            if (!family) continue;
            const ladder = LADDERS[family];
            // Short reps in a turn of their own climb their own ladder; the
            // rest climb their flavour's, whichever family's turn it is.
            const key =
              family === "repetition" &&
              ROLLING_SPECS[goal].rotation.includes("reps")
                ? "reps"
                : run.type;
            const before = highest.get(key) ?? -1;
            const lowest = ladder.indexOf(run.templateId);
            const most = ladder.lastIndexOf(run.templateId);
            const label = `${goal} (${pace ?? "no benchmark"}) week ${w + 1}: ${run.templateId}`;
            expect(lowest, label).toBeLessThanOrEqual(before + 1);
            expect(lowest, label).toBeLessThanOrEqual(
              key === "tempo" ? peaks[goal].tempo : peaks[goal].intervals
            );
            highest.set(key, Math.max(before, Math.min(most, before + 1)));
          }
        });
      }
  });
});

describe("a plan with no race date's light weeks (Run24 (5))", () => {
  it("open on a fartlek, then hold a fartlek or short hills in turn where a block's base would", () => {
    for (const goal of ROLLING_GOALS) {
      const weeks = plan(goal, { weeks: 24 });
      expect(
        sessions(weeks[0]).map((r) => r.templateId),
        goal
      ).toEqual(["fartlek_30"]);
      const light = weeks
        .flatMap(sessions)
        .map((r) => r.templateId)
        .filter((id) => LIGHT.includes(id));
      light.forEach((id, i) => expect(id, `${goal} ${i}`).toBe(LIGHT[i % 2]));
    }
    // Build to 5K's light turns are two of every three build weeks.
    expect(
      plan("build_5k", { weeks: 12 }).map((week) =>
        sessions(week).map((r) => r.templateId)
      )
    ).toEqual([
      ["fartlek_30"],
      ["hills_6x30s"],
      ["fartlek_30"],
      [],
      ["tempo_20"],
      ["hills_6x30s"],
      ["fartlek_30"],
      [],
      ["progression_40"],
      ["hills_6x30s"],
      ["fartlek_30"],
      [],
    ]);
  });

  it("keep the lighter week to strides alone", () => {
    for (const goal of ROLLING_GOALS) {
      const weeks = plan(goal, { weeks: 24 });
      for (const back of [3, 7, 11, 15, 19, 23]) {
        expect(sessions(weeks[back]), `${goal} week ${back + 1}`).toEqual([]);
        expect(
          weeks[back].some((run) => run.templateId.endsWith("_strides"))
        ).toBe(true);
      }
    }
  });

  it("hold strides on two run days, and under gentler, which keeps to the tempo's first rung", () => {
    for (const goal of ROLLING_GOALS) {
      const twoDays = plan(goal, { runDays: 2 }).flatMap(sessions);
      expect(
        twoDays.some((r) => LIGHT.includes(r.templateId)),
        goal
      ).toBe(false);
      const gentler = plan(goal, { difficulty: "gentler" }).flatMap(sessions);
      expect(
        gentler.every((r) =>
          ["tempo_20", "cruise_3x8", "progression_40"].includes(r.templateId)
        ),
        goal
      ).toBe(true);
    }
    // A goal with tempos still holds them under gentler, in turn.
    expect(
      plan("build_10k", { difficulty: "gentler" })
        .flatMap(sessions)
        .map((r) => r.templateId)
        .slice(0, 3)
    ).toEqual(["tempo_20", "cruise_3x8", "progression_40"]);
  });
});

describe("a plan begun as a new runner (Run24 (8))", () => {
  const until = newRunnerUntil("new", START);

  it("holds no session, light or otherwise, until they have run 40 minutes in one go", () => {
    for (const goal of ROLLING_GOALS) {
      const weeks = plan(goal, {
        newRunnerUntil: until,
        pace: null,
        weeks: 20,
      });
      expect(weeks.flatMap(sessions), goal).toEqual([]);
      expect(weeks.flat().some(isTrial), goal).toBe(false);
    }
  });

  it("then holds the library's sessions, the first of each kind its first family's first rung", () => {
    // A 45-minute run two days before the plan: quality may come once the
    // run-walk weeks are over.
    const weeks = plan("build_10k", {
      newRunnerUntil: until,
      pace: null,
      weeks: 20,
      recentRuns: [{ date: day(-2), duration: 45 * 60, distance: 7500 }],
    });
    weeks
      .slice(0, NEW_RUNNER_WEEKS)
      .forEach((week) => expect(sessions(week)).toEqual([]));
    const held = weeks.flatMap(sessions).map((r) => r.templateId);
    expect(held.length).toBeGreaterThan(0);
    const firstTempo = held.find((id) =>
      ["tempo", "cruise", "progression"].includes(familyOf(id) ?? "")
    );
    const firstIntervals = held.find((id) =>
      ["km", "pace10k", "timed", "repetition"].includes(familyOf(id) ?? "")
    );
    expect(firstTempo).toBe("tempo_20");
    expect(firstIntervals).toBe("4x1k");
  });
});

describe("the structured week (Run24 (5))", () => {
  it("takes a 10K's sessions in turn on the rungs it held, with no cruise intervals under its 20-minute tempo", () => {
    const quality = (weekNumber: number) =>
      scheduleStructuredWeekV2({
        weekSchedule: generateSchedule(0, 4),
        weekNumber,
        weekStart: START,
      }).find((run) => run.type === "tempo" || run.type === "intervals")!
        .templateId;
    expect(Array.from({ length: 9 }, (_, i) => quality(i + 1))).toEqual([
      "5x1k",
      "tempo_20",
      "10k_pace_3x2k",
      "progression_40",
      "5x3min",
      "tempo_20",
      "10x200",
      "progression_40",
      "5x1k",
    ]);
  });
});
