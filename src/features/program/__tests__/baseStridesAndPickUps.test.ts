/**
 * Deep dive D5 and D6, the light quality the session library left out:
 * strides twice in a three-day base week (Run24 (5)), and a new runner's
 * 6 x 1 minute pick-ups by time, in turn with strides, before they can run
 * 40 minutes in one go (Run24 (8)).
 */
import { describe, expect, it } from "vitest";
import { generateRacePlanV2, type RacePlanV2Input } from "../runScheduler";
import { getPhaseForWeek } from "../runPlanTiming";
import { newRunnerUntil, newRunnerTemplate } from "../newRunner";
import { generateSchedule } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { segmentsFromEasyWithPickUps } from "@/lib/runSegments";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

const START = "2026-03-09";
type Distance = RacePlanV2Input["raceGoal"]["distance"];
const day = (weeks: number, days = 0) =>
  localDateString(addLocalDays(parseLocalDate(START), weeks * 7 + days));

function plan(
  distance: Distance,
  weeks: number,
  runDays: number,
  more: Partial<RacePlanV2Input> = {}
) {
  return generateRacePlanV2({
    recentLayoff: "none",
    weekSchedule: generateSchedule(0, runDays),
    weeklyRunDays: runDays,
    raceGoal: { distance, targetDate: day(weeks, -1) },
    currentDate: START,
    weekStart: START,
    ...more,
  });
}
const template = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;
const strides = (id: string) => !!template(id).config.strides;
const pickUps = (id: string) => !!template(id).config.pickUps;
const light = (id: string) => ["fartlek_30", "hills_6x30s"].includes(id);

describe("strides twice in a three-day base week (Run24 (5), D5)", () => {
  it("keeps strides on the medium-long where the light session took the strides run's day", () => {
    for (const distance of ["5k", "10k", "half"] as const) {
      const out = plan(distance, 14, 3, { easyPaceSPerKm: 360 });
      const base = out.weeks.filter(
        (_, w) => getPhaseForWeek(w, 14, distance, out.shortBase) === "base"
      );
      expect(base.length, distance).toBeGreaterThan(0);
      for (const week of base) {
        const ids = week.map((run) => run.templateId);
        if (!ids.some(light)) continue;
        // Long run, light session, and the one easy run with its strides.
        expect(
          ids.filter(strides),
          `${distance}: ${ids.join(" ")}`
        ).toHaveLength(1);
      }
      expect(
        base.some((week) => week.some((run) => light(run.templateId))),
        distance
      ).toBe(true);
    }
  });

  it("leaves a four-day base week's strides on its second easy run", () => {
    const out = plan("half", 14, 4, { easyPaceSPerKm: 360 });
    const week0 = out.weeks[0].map((run) => run.templateId);
    expect(week0.filter(light)).toHaveLength(1);
    expect(week0.filter(strides)).toHaveLength(1);
    // The medium-long, the first easy run filled, stays plain.
    expect(week0.filter((id) => /^easy_\d+$/.test(id))).toHaveLength(1);
  });
});

describe("a new runner's pick-ups by time (Run24 (8), D6)", () => {
  const until = newRunnerUntil("new", START);
  const beginner = (more: Partial<RacePlanV2Input> = {}) =>
    plan("5k", 16, 3, { newRunnerUntil: until, recentRuns: [], ...more });

  it("alternate with strides after the run-walk weeks, until quality starts", () => {
    const out = beginner();
    const variant = out.weeks.slice(6, 14).map((week) => {
      const ids = week.map((run) => run.templateId);
      return ids.some(pickUps)
        ? "pick-ups"
        : ids.some(strides)
          ? "strides"
          : "";
    });
    // Week 7's runs are held to 25 minutes, too short for either.
    expect(variant).toEqual([
      "",
      "pick-ups",
      "strides",
      "pick-ups",
      "strides",
      "pick-ups",
      "strides",
      "pick-ups",
    ]);
    // None in the run-walk weeks: every run is the week's run-walk.
    for (const week of out.weeks.slice(0, 6))
      expect(week.some((run) => pickUps(run.templateId))).toBe(false);
  });

  it("stop when the runner has run 40 minutes in one go", () => {
    // A 42-minute run in week 9: quality from week 10.
    const read = day(9);
    const out = beginner({
      currentDate: read,
      weekStart: read,
      planTotalWeeks: 16,
      recentRuns: [{ date: day(8, 5), duration: 42 * 60, distance: 7000 }],
      recentRunsAsOf: read,
    });
    expect(out.weeks.flat().some((run) => pickUps(run.templateId))).toBe(false);
  });

  it("are not a regular runner's", () => {
    const out = plan("5k", 16, 3, { easyPaceSPerKm: 360 });
    expect(out.weeks.flat().some((run) => pickUps(run.templateId))).toBe(false);
  });

  it("run by feel, with no pace, and fill the run's minutes", () => {
    for (const id of [
      "easy_30_pickups",
      "easy_40_pickups",
      "easy_50_pickups",
    ]) {
      const t = template(id);
      expect(t.type).toBe("easy");
      const segments = segmentsFromEasyWithPickUps(
        t.estimatedDuration,
        t.config.pickUps!
      );
      const seconds = segments.reduce(
        (sum, s) => sum + (s.target.kind === "duration" ? s.target.seconds : 0),
        0
      );
      expect(seconds, id).toBe(t.estimatedDuration * 60);
      expect(segments.filter((s) => s.type === "moderate")).toHaveLength(6);
      for (const s of segments) {
        expect(s.paceTarget).toBeUndefined();
        expect(s.pacePinned).toBeUndefined();
      }
    }
  });

  it("stay pick-ups when a new runner's minutes shorten them, else become a plain easy run", () => {
    // Two weeks after the run-walk weeks the runs are held to 30 minutes.
    expect(newRunnerTemplate("easy_40_pickups", day(7), until)?.id).toBe(
      "easy_30_pickups"
    );
    // One week after, to 25: no pick-ups run fits.
    expect(newRunnerTemplate("easy_30_pickups", day(6), until)?.id).toBe(
      "easy_20"
    );
    // And a plain easy run never gains them.
    expect(newRunnerTemplate("easy_40", day(7), until)?.id).toBe("easy_30");
  });
});
