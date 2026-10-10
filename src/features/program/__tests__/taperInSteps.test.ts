/**
 * Run22 — the taper in steps, with a reduced long run (decisions.md R8).
 *
 * The taper made one cut, held it to race week and dropped the long run, so
 * a marathon was the first long run in a month. Now three weeks before race
 * week the long run is 75% of the build's longest and the easy runs 75% of
 * the last build week's; two weeks before, 60% and 60%; the week before
 * race week and race week are as they were. The shares are Tropos
 * heuristics; the direction is Bosquet 2007's progressive cut and the
 * coaching sources' reduced long run two to three weeks out.
 *
 * Asserted as the plan's properties, against the plan's own build weeks,
 * not by recomputing the scheduler's formula.
 */
import { describe, it, expect } from "vitest";

import { generateRacePlanV2, TAPER_WEEKS_BY_DISTANCE } from "../runScheduler";
import { generateSchedule } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
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

function plan(
  distance: "5k" | "10k" | "half" | "marathon",
  daysAhead: number,
  recentLayoff: "none" | "detrained" = "none"
) {
  return generateRacePlanV2({
    recentLayoff,
    weekSchedule: generateSchedule(2, 4),
    raceGoal: { distance, targetDate: targetDate(daysAhead) },
    weeklyRunDays: 4,
    currentDate: CURRENT,
    weekStart: WEEK_START,
    tuning: { volume: "standard", difficulty: "standard" },
  });
}

const template = (id: string) => {
  const t = RUN_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`no template ${id}`);
  return t;
};
const longKm = (week: { templateId: string }[]) =>
  Math.max(
    0,
    ...week
      .map((d) => template(d.templateId))
      .filter((t) => t.type === "long")
      .map((t) => t.config.targetDistanceKm ?? 0)
  );
const easyMinutes = (week: { templateId: string }[]) =>
  week
    .map((d) => template(d.templateId))
    .filter((t) => t.type === "easy")
    .map((t) => t.estimatedDuration);
const minutes = (week: { templateId: string }[]) =>
  week.reduce((sum, d) => sum + template(d.templateId).estimatedDuration, 0);
/** The plan's own long-run sizes, as `long_<km>k`. */
const LONG_SIZES = RUN_TEMPLATES.filter((t) => /^long_\d+k$/.test(t.id))
  .map((t) => t.config.targetDistanceKm ?? 0)
  .sort((a, b) => a - b);
const largestAtMost = (km: number) =>
  Math.max(LONG_SIZES[0], ...LONG_SIZES.filter((size) => size <= km));
/** The plan's own easy sizes: never under 30 minutes. */
const EASY_SIZES = RUN_TEMPLATES.filter((t) => /^easy_\d+$/.test(t.id))
  .map((t) => t.estimatedDuration)
  .filter((minutes) => minutes >= 30);
const easyAtMost = (minutes: number) =>
  Math.max(30, ...EASY_SIZES.filter((size) => size <= minutes));

/** A plan's weeks by their distance from race week: [3] is three weeks
 *  before it, [0] is race week. */
function fromRaceWeek(p: ReturnType<typeof plan>) {
  return (out: number) => p.weeks[p.weeks.length - 1 - out];
}

describe("the taper in steps (Run22)", () => {
  it("a marathon keeps a long run three and two weeks before race week, at 75% and 60% of the build's longest", () => {
    // 34 days: a block with one build week, the taper's share taken of it.
    for (const daysAhead of [34, 120, 200, 300]) {
      const p = plan("marathon", daysAhead);
      const out = fromRaceWeek(p);
      const taper = TAPER_WEEKS_BY_DISTANCE.marathon;
      const build = p.weeks.slice(0, p.weeks.length - 1 - taper);
      const longest = Math.max(...build.map(longKm));
      expect(longKm(out(3)), `${daysAhead} days: 3 weeks out`).toBe(
        largestAtMost(longest * 0.75)
      );
      expect(longKm(out(2)), `${daysAhead} days: 2 weeks out`).toBe(
        largestAtMost(longest * 0.6)
      );
      expect(longKm(out(1)), `${daysAhead} days: the week before`).toBe(0);
    }
  });

  it("a half keeps a long run two weeks before race week, at 60% of the build's longest", () => {
    for (const daysAhead of [90, 140, 200]) {
      const p = plan("half", daysAhead);
      const out = fromRaceWeek(p);
      const taper = TAPER_WEEKS_BY_DISTANCE.half;
      const build = p.weeks.slice(0, p.weeks.length - 1 - taper);
      const longest = Math.max(...build.map(longKm));
      expect(longKm(out(2)), `${daysAhead} days: 2 weeks out`).toBe(
        largestAtMost(longest * 0.6)
      );
      expect(longKm(out(1)), `${daysAhead} days: the week before`).toBe(0);
    }
  });

  it("the easy runs step down with it, the medium-long among them, never under 30 minutes", () => {
    for (const distance of ["half", "marathon"] as const) {
      const p = plan(distance, 200);
      const out = fromRaceWeek(p);
      const taper = TAPER_WEEKS_BY_DISTANCE[distance];
      // The last build week: a medium-long and a shorter easy run.
      const lastBuild = easyMinutes(out(taper + 1));
      expect(Math.max(...lastBuild), distance).toBeGreaterThan(
        Math.min(...lastBuild)
      );
      for (const [weeks, share] of [
        [3, 0.75],
        [2, 0.6],
      ] as const) {
        if (weeks > taper) continue;
        const week = easyMinutes(out(weeks));
        const at = `${distance}: ${weeks} weeks out`;
        expect(Math.max(...week), at).toBe(
          easyAtMost(Math.max(...lastBuild) * share)
        );
        expect(Math.min(...week), at).toBe(
          easyAtMost(Math.min(...lastBuild) * share)
        );
      }
      expect(Math.max(...easyMinutes(out(taper))), distance).toBeGreaterThan(
        30
      );
      for (const m of easyMinutes(out(1))) expect(m, distance).toBe(30);
    }
  });

  it("its hour-long medium-long keeps off the days beside the long run and the session (Run20)", () => {
    // The plan's week: the first easy day after the session is the day
    // after it, so the medium-long goes to the next one.
    const week = fromRaceWeek(plan("marathon", 200))(3);
    const mediumLong = week.find(
      (d) =>
        template(d.templateId).type === "easy" &&
        template(d.templateId).estimatedDuration >= 60
    );
    expect(mediumLong).toBeDefined();
    const apart = (a: number, b: number) =>
      Math.min(Math.abs(a - b), 7 - Math.abs(a - b));
    for (const other of week.filter((d) => d.type !== "easy"))
      expect(
        apart(mediumLong!.dayIndex, other.dayIndex),
        `${mediumLong!.templateId} beside ${other.templateId}`
      ).toBeGreaterThan(1);
  });

  it("each taper week runs less than the one before, the first under the build's biggest week", () => {
    for (const distance of ["half", "marathon"] as const) {
      const p = plan(distance, 200);
      const out = fromRaceWeek(p);
      const taper = TAPER_WEEKS_BY_DISTANCE[distance];
      const build = p.weeks.slice(0, p.weeks.length - 1 - taper);
      const biggest = Math.max(...build.map(minutes));
      expect(
        minutes(out(taper)),
        `${distance}: the first taper week`
      ).toBeLessThan(biggest);
      for (let weeks = taper; weeks > 1; weeks--)
        expect(
          minutes(out(weeks - 1)),
          `${distance}: ${weeks - 1} weeks out against ${weeks}`
        ).toBeLessThan(minutes(out(weeks)));
    }
  });

  it("a 10K and a 5K keep their one-week taper: no long run, every run an easy 30", () => {
    for (const distance of ["5k", "10k"] as const) {
      const out = fromRaceWeek(plan(distance, 120));
      expect(longKm(out(1)), distance).toBe(0);
      for (const m of easyMinutes(out(1))) expect(m, distance).toBe(30);
    }
  });

  it("a plan with no build week keeps the taper it had: no build to take a share of", () => {
    // Four weeks to a Sunday marathon: at its taper floor, not under it,
    // and every week before race week is taper.
    const p = plan("marathon", 27);
    expect(p.belowFloor).toBe(false);
    expect(p.weeks).toHaveLength(4);
    for (const week of p.weeks.slice(0, -1)) {
      expect(longKm(week)).toBe(0);
      for (const m of easyMinutes(week)) expect(m).toBe(30);
    }
  });

  it("a detrained runner's taper steps its long run and keeps no medium-long", () => {
    const p = plan("marathon", 200, "detrained");
    const out = fromRaceWeek(p);
    const build = p.weeks.slice(0, p.weeks.length - 4);
    expect(longKm(out(3))).toBe(
      largestAtMost(Math.max(...build.map(longKm)) * 0.75)
    );
    for (const weeks of [3, 2, 1])
      for (const m of easyMinutes(out(weeks))) expect(m).toBe(30);
  });

  it("a plan inside the taper floor keeps its finish-safely shape", () => {
    // Three weeks to a marathon: under its taper floor of four.
    const p = plan("marathon", 20);
    expect(p.belowFloor).toBe(true);
    for (const week of p.weeks.slice(0, -1)) {
      expect(longKm(week)).toBe(0);
      for (const m of easyMinutes(week)) expect(m).toBe(30);
    }
  });
});
