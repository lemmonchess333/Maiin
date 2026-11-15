/**
 * Run26 (2): ultra and trail plans. Race plans for 50K, 50 miles and 100K;
 * trail as a property of any race, its total climb; long runs in time on
 * feet for an ultra or a trail race; climbs, and downhill running for a race
 * whose descents are a large part of it; back-to-back long runs on an
 * ultra's weekend in its last build weeks; and trail sessions by effort.
 * The road plans, 5K to marathon, hold none of it.
 */
import { describe, expect, it } from "vitest";
import {
  generateRacePlanV2,
  recoveryWeeksForDistance,
  type RacePlanV2Input,
} from "../runScheduler";
import {
  climbEffortFactor,
  getPhaseForWeek,
  isDescentHeavy,
  isRunStepBackWeek,
  isTrailRace,
  isUltraDistance,
  RACE_BLOCK_MAX_WEEKS,
  sizesLongRunsInTime,
  TAPER_WEEKS_BY_DISTANCE,
} from "../runPlanTiming";
import { runningClimb, type RunningBaseline } from "../runningBaseline";
import { plannedRunMinutes } from "../runTimeLimits";
import { defaultWeekSchedule, type ScheduleDay } from "@/lib/scheduleUtils";
import { shorteningRank, stepDownOneRung } from "@/lib/planDeloadWeek";
import { computePlanMetadata } from "@/lib/runPlanMetadata";
import { trainingBands } from "@/lib/runPaces";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

const START = "2026-03-09";
type Distance = RacePlanV2Input["raceGoal"]["distance"];

/** Runs on Tuesday, Thursday, Saturday and Sunday: an ultra's week. */
function week(days: number[]): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, day) => ({
    day,
    type: days.includes(day) ? "run" : "rest",
  })) as ScheduleDay[];
}
const TUE_THU_SAT_SUN = week([2, 4, 6, 0]);
const TUE_THU_SUN = week([2, 4, 0]);

function plan(
  distance: Distance,
  weeks: number,
  more: Partial<RacePlanV2Input> & { climbM?: number } = {}
) {
  const { climbM, ...rest } = more;
  return generateRacePlanV2({
    recentLayoff: "none",
    weekSchedule: TUE_THU_SAT_SUN,
    weeklyRunDays: 4,
    raceGoal: {
      distance,
      targetDate: localDateString(
        addLocalDays(parseLocalDate(START), weeks * 7 - 2)
      ),
      ...(climbM !== undefined ? { climbM } : {}),
    },
    currentDate: START,
    weekStart: START,
    ...rest,
  });
}

const template = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;
const minutes = (id: string) => plannedRunMinutes(template(id), null);
const runsOf = (out: ReturnType<typeof plan>) => out.weeks.flat();
const longsOf = (out: ReturnType<typeof plan>) =>
  out.weeks.map((w) => w.find((run) => run.type === "long") ?? null);
const phaseOf = (out: ReturnType<typeof plan>, distance: Distance, w: number) =>
  getPhaseForWeek(w, out.totalWeeks, distance, out.shortBase);
const weekMinutes = (runs: { templateId: string; type: string }[]) =>
  runs.reduce((n, r) => n + (r.type === "race" ? 0 : minutes(r.templateId)), 0);

describe("trail is a property of a race, its climb", () => {
  it("10 m of climb a km or more makes a trail race at any distance", () => {
    expect(isTrailRace({ distance: "marathon", climbM: 450 })).toBe(true);
    expect(isTrailRace({ distance: "marathon", climbM: 400 })).toBe(false);
    expect(isTrailRace({ distance: "10k", climbM: 100 })).toBe(true);
    expect(isTrailRace({ distance: "100k", climbM: 900 })).toBe(false);
    expect(isTrailRace({ distance: "half" })).toBe(false);
  });

  it("20 m a km or more adds downhill running", () => {
    expect(isDescentHeavy({ distance: "50k", climbM: 1000 })).toBe(true);
    expect(isDescentHeavy({ distance: "50k", climbM: 900 })).toBe(false);
  });

  it("a trail race's kilometre counts its climb, as ITRA's km-effort does", () => {
    expect(climbEffortFactor({ distance: "50k", climbM: 1500 })).toBeCloseTo(
      1.3
    );
    // Under the threshold the course is run as flat.
    expect(climbEffortFactor({ distance: "marathon", climbM: 300 })).toBe(1);
  });

  it("an ultra, or a trail race, sizes its long runs in time", () => {
    expect(sizesLongRunsInTime({ distance: "50k" })).toBe(true);
    expect(sizesLongRunsInTime({ distance: "half", climbM: 400 })).toBe(true);
    expect(sizesLongRunsInTime({ distance: "marathon" })).toBe(false);
  });
});

describe.each([
  ["50k", 210, 2, 4],
  ["50mi", 270, 3, 5],
  ["100k", 300, 3, 5],
] as const)("a %s plan", (distance, ceiling, backToBacks, recovery) => {
  const weeks = 20;
  const out = plan(distance, weeks);

  it("runs the block's weeks to race day, the race in the last", () => {
    expect(isUltraDistance(distance)).toBe(true);
    expect(out.totalWeeks).toBe(weeks);
    expect(RACE_BLOCK_MAX_WEEKS[distance]).toBe(20);
    expect(TAPER_WEEKS_BY_DISTANCE[distance]).toBe(3);
    const race = out.weeks[weeks - 1].find((run) => run.type === "race");
    expect(race?.templateId).toBe(`${distance}_race`);
    expect(recoveryWeeksForDistance(distance)).toBe(recovery);
  });

  it("sizes every long run in time on feet, under its ceiling", () => {
    const longs = longsOf(out).filter((run) => run !== null);
    expect(longs.length).toBeGreaterThan(10);
    for (const run of longs) {
      expect(template(run.templateId).config.timeOnFeet, run.templateId).toBe(
        true
      );
      expect(template(run.templateId).config.targetDistanceKm).toBeUndefined();
      expect(minutes(run.templateId)).toBeLessThanOrEqual(ceiling);
    }
    // The peak, at the ladder's nominal pace (32 km in 180 minutes): the
    // distance's peak kilometres, under the ceiling.
    const peak = Math.max(...longs.map((run) => minutes(run.templateId)));
    expect(peak).toBe({ "50k": 180, "50mi": 225, "100k": 240 }[distance]);
  });

  it("climbs a rung of 15 minutes a week at most, and steps back", () => {
    let highest = 0;
    out.weeks.forEach((w, i) => {
      const long = w.find((run) => run.type === "long");
      const phase = phaseOf(out, distance, i);
      if (!long || (phase !== "base" && phase !== "build")) return;
      const m = minutes(long.templateId);
      if (highest > 0)
        expect(m, `week ${String(i)}`).toBeLessThanOrEqual(highest + 15);
      if (isRunStepBackWeek(i, weeks, distance))
        expect(m, `step-back ${String(i)}`).toBeLessThan(highest);
      highest = Math.max(highest, m);
    });
  });

  it("holds each week to 15% over the last that was not a step-back", () => {
    let last: number | null = null;
    out.weeks.forEach((w, i) => {
      const phase = phaseOf(out, distance, i);
      if (phase !== "base" && phase !== "build") return;
      const total = weekMinutes(w);
      if (last !== null)
        expect(total, `week ${String(i)}`).toBeLessThanOrEqual(
          last * 1.15 + 0.5
        );
      if (!isRunStepBackWeek(i, weeks, distance)) last = total;
    });
  });

  it(`holds ${String(backToBacks)} back-to-back weekends in its last build weeks`, () => {
    const pairs = out.weeks
      .map((w, i) => ({ w, i }))
      .filter(({ w }) =>
        w.some((run) => template(run.templateId).config.backToBack)
      );
    expect(pairs.length).toBe(backToBacks);
    for (const { w, i } of pairs) {
      expect(phaseOf(out, distance, i)).toBe("build");
      expect(isRunStepBackWeek(i, weeks, distance)).toBe(false);
      const b2b = w.find((run) => template(run.templateId).config.backToBack)!;
      const long = w.find((run) => run.type === "long")!;
      // Saturday beside Sunday's long run, 60% of its time at most, an
      // hour at least, and an easy run by type.
      expect(b2b.dayIndex).toBe(6);
      expect(long.dayIndex).toBe(0);
      expect(b2b.type).toBe("easy");
      expect(minutes(b2b.templateId)).toBeGreaterThanOrEqual(60);
      expect(minutes(b2b.templateId)).toBeLessThanOrEqual(
        0.6 * minutes(long.templateId)
      );
      // One quality session in the week: the weekend is its load.
      expect(
        w.filter((run) => run.type === "tempo" || run.type === "intervals")
          .length
      ).toBeLessThanOrEqual(1);
    }
    // The last of them is the build's last week, three weeks before race
    // week.
    expect(pairs[pairs.length - 1].i).toBe(weeks - 1 - 3 - 1);
  });

  it("keeps a reduced long run in its taper and none in race week", () => {
    const longs = longsOf(out);
    const peak = Math.max(
      ...longs.filter((r) => r !== null).map((r) => minutes(r.templateId))
    );
    expect(minutes(longs[weeks - 4]!.templateId)).toBeLessThanOrEqual(
      0.75 * peak
    );
    expect(minutes(longs[weeks - 3]!.templateId)).toBeLessThanOrEqual(
      0.6 * peak
    );
    expect(longs[weeks - 2]).toBeNull();
    expect(longs[weeks - 1]).toBeNull();
    expect(
      out.weeks[weeks - 4].some((r) => r.templateId === "sharpener_ultra")
    ).toBe(true);
  });
});

describe("a plan in time keeps what its block has held", () => {
  it("never peaks under the long run already run when a faster pace is confirmed", () => {
    const from = localDateString(addLocalDays(parseLocalDate(START), 7 * 10));
    const rebuilt = (heldLongMinutes?: number) =>
      generateRacePlanV2({
        recentLayoff: "none",
        weekSchedule: TUE_THU_SAT_SUN,
        weeklyRunDays: 4,
        raceGoal: {
          distance: "100k",
          targetDate: localDateString(
            addLocalDays(parseLocalDate(START), 20 * 7 - 2)
          ),
        },
        currentDate: from,
        weekStart: from,
        planTotalWeeks: 20,
        // A 5:00 /km easy pace, faster than the ladder's nominal 5:38.
        easyPaceSPerKm: 300,
        blockInputs: {
          startingPoint: null,
          runsPaceSPerKm: null,
          heldLongKm: 0,
          ...(heldLongMinutes !== undefined ? { heldLongMinutes } : {}),
        },
      });
    const peak = (out: ReturnType<typeof rebuilt>) =>
      Math.max(
        ...out.weeks
          .flat()
          .filter((run) => run.type === "long")
          .map((run) => minutes(run.templateId))
      );
    // At 5:00 /km the 100K's 44 km is 220 minutes: a peak of 210.
    expect(peak(rebuilt())).toBe(210);
    expect(peak(rebuilt(225))).toBe(225);
    expect(rebuilt(225).blockInputs?.heldLongMinutes).toBeGreaterThanOrEqual(
      225
    );
  });
});

describe("an ultra's back-to-back runs", () => {
  it("need a run day beside the long run", () => {
    const out = plan("50k", 20, {
      weekSchedule: TUE_THU_SUN,
      weeklyRunDays: 3,
    });
    expect(
      runsOf(out).some((run) => template(run.templateId).config.backToBack)
    ).toBe(false);
  });

  it("are left out of a lighter plan and a compressed one", () => {
    const lighter = plan("100k", 20, {
      tuning: { volume: "lighter", difficulty: "standard" },
    });
    const short = plan("100k", 12);
    for (const out of [lighter, short])
      expect(
        runsOf(out).some((run) => template(run.templateId).config.backToBack)
      ).toBe(false);
  });

  it("are a setup default's: an ultra's week runs on both weekend days", () => {
    const road = defaultWeekSchedule(2, 4);
    const ultra = defaultWeekSchedule(2, 4, true);
    const runsOn = (s: ScheduleDay[], day: number) =>
      s[day].type === "run" || s[day].type === "both";
    expect(runsOn(ultra, 0) && runsOn(ultra, 6)).toBe(true);
    // The lifts stay where they were, and the road week is as it was.
    expect(ultra.filter((d) => d.type === "lift").map((d) => d.day)).toEqual(
      road.filter((d) => d.type === "lift").map((d) => d.day)
    );
    expect(road.filter((d) => runsOn(road, d.day)).length).toBe(4);
  });
});

describe("a trail race", () => {
  const climbs = plan("50k", 20, { climbM: 1500 });
  const hilly = plan("half", 14, {
    climbM: 300,
    weeklyRunDays: 3,
    weekSchedule: TUE_THU_SUN,
  });
  const ids = (out: ReturnType<typeof plan>) =>
    runsOf(out).map((run) => run.templateId);

  it("sizes its long runs longer by its climb", () => {
    const flat = plan("50k", 20);
    const peak = (out: ReturnType<typeof plan>) =>
      Math.max(
        ...longsOf(out)
          .filter((r) => r !== null)
          .map((r) => minutes(r.templateId))
      );
    expect(peak(climbs)).toBeGreaterThan(peak(flat));
    expect(peak(climbs)).toBe(210);
  });

  it("holds climbs and hill repeats, and downhill running where its descents are steep", () => {
    expect(ids(climbs).some((id) => id.startsWith("climbs_"))).toBe(true);
    expect(ids(climbs).some((id) => id.startsWith("hills_"))).toBe(true);
    expect(ids(climbs).some((id) => id.startsWith("downhill_"))).toBe(true);
    // A half at 14 m a km is a trail race, not a descent-heavy one.
    expect(isTrailRace({ distance: "half", climbM: 300 })).toBe(true);
    expect(ids(hilly).some((id) => id.startsWith("climbs_"))).toBe(true);
    expect(ids(hilly).some((id) => id.startsWith("downhill_"))).toBe(false);
  });

  it("holds no time trial, no tempo at a pace and a sharpener up a hill", () => {
    for (const out of [climbs, hilly]) {
      expect(ids(out).some((id) => template(id).config.timeTrial)).toBe(false);
      expect(ids(out).some((id) => template(id).config.tempo)).toBe(false);
      expect(ids(out)).toContain("sharpener_trail");
    }
  });

  it("speaks in effort: its long runs, climbs and descents carry no pace", () => {
    const table = {
      vdot: 45,
      ...trainingBands(45),
      race: { "5k": 250, "10k": 260, half: 275, marathon: 290 },
    };
    const seen = new Set<string>();
    for (const run of runsOf(climbs)) {
      const t = template(run.templateId);
      if (!t.config.timeOnFeet && !t.config.uphill && !t.config.downhill)
        continue;
      seen.add(t.id);
      const { prefill } = computePlanMetadata({
        displayUnit: "km",
        profileRunMode: "race_prep",
        todayDayIndex: run.dayIndex,
        todayDate: run.date!,
        runPlan: undefined,
        runDays: [run],
        urlTemplateId: run.templateId,
        urlType: null,
        urlScheduledRunId: run.id ?? null,
        paceTable: table as never,
        raceTarget: null,
      });
      expect(prefill.target?.type, t.id).not.toBe("pace");
      expect(prefill.target?.type === "distance", t.id).toBe(false);
      for (const seg of prefill.segments ?? [])
        expect(seg.paceTarget, `${t.id} ${seg.label}`).toBeUndefined();
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe("the road plans hold none of it", () => {
  it.each(["5k", "10k", "half", "marathon"] as const)(
    "a %s plan, with or without a little climb, is on the distance ladder",
    (distance) => {
      // 5 m a km: a rolling road course.
      const km = { "5k": 5, "10k": 10, half: 21.1, marathon: 42.2 }[distance];
      for (const climbM of [undefined, Math.round(5 * km)]) {
        const out = plan(distance, 16, climbM !== undefined ? { climbM } : {});
        for (const run of runsOf(out)) {
          const t = template(run.templateId);
          expect(t.config.timeOnFeet, run.templateId).toBeUndefined();
          expect(
            t.config.steadyClimbs || t.config.downhill,
            run.templateId
          ).toBeFalsy();
        }
      }
    }
  );
});

describe("the fits keep a run in its own family", () => {
  it("never shortens a run in time on feet to one in kilometres, nor back", () => {
    const long = template("long_time_120");
    expect(shorteningRank(long, template("long_10k"))).toBeNull();
    expect(shorteningRank(template("long_20k"), long)).toBeNull();
    expect(shorteningRank(long, template("long_time_90"))).toBe(0);
    expect(
      shorteningRank(template("back_to_back_90"), template("easy_60"))
    ).toBeNull();
    expect(
      shorteningRank(template("easy_75"), template("back_to_back_60"))
    ).toBeNull();
  });

  it("steps a long run in time down half an hour, a back-to-back a rung", () => {
    expect(stepDownOneRung("long_time_180")).toBe("long_time_150");
    expect(stepDownOneRung("long_time_75")).toBe("long_time_60");
    expect(stepDownOneRung("back_to_back_120")).toBe("back_to_back_105");
    expect(stepDownOneRung("back_to_back_60")).toBeNull();
    expect(stepDownOneRung("climbs_4x6min")).toBe("climbs_4x5min");
    expect(stepDownOneRung("downhill_6x2min")).toBe("downhill_6x90s");
  });

  it("climbs a starting point on the time ladder in a plan in time", () => {
    const baseline: RunningBaseline = {
      version: 1,
      experience: "regular",
      weeklyMinutes: 300,
      longestRunMinutes: 125,
      confirmedAt: START,
      source: "self_reported",
    };
    const inTime = runningClimb(baseline, START, { timeOnFeet: true });
    expect(inTime.longestMinutes).toBe(120);
    const later = runningClimb(baseline, "2026-03-23", { timeOnFeet: true });
    expect(later.longestMinutes).toBe(150);
  });
});
