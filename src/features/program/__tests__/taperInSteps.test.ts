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

import {
  generateRacePlanV2,
  TAPER_WEEKS_BY_DISTANCE,
  type RacePlanV2Input,
} from "../runScheduler";
import { newRunnerUntil } from "../newRunner";
import { generateSchedule } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  addLocalDays,
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

const START = "2026-09-07"; // a Monday
/** A race `weeks` weeks out, on the last day of its week, built in the
 *  block's week `at`: 0 is a new plan, a later week the rollover's build of
 *  it from the block it carries. Three run days unless `more` says. */
const built = (
  distance: RacePlanV2Input["raceGoal"]["distance"],
  weeks: number,
  more: Partial<RacePlanV2Input> = {},
  at = 0
) => {
  const weekStart = localDateString(
    addLocalDays(parseLocalDate(START), at * 7)
  );
  return generateRacePlanV2({
    recentLayoff: "none",
    weekSchedule: generateSchedule(0, 3),
    weeklyRunDays: 3,
    raceGoal: {
      distance,
      targetDate: localDateString(
        addLocalDays(parseLocalDate(START), weeks * 7 - 1)
      ),
    },
    currentDate: weekStart,
    weekStart,
    planTotalWeeks: weeks,
    ...more,
  });
};
const runDays = (days: number) => ({
  weekSchedule: generateSchedule(0, days),
  weeklyRunDays: days,
});
const newRunner = { newRunnerUntil: newRunnerUntil("new", START) };
const timeLimited = {
  runTimeLimits: { sessionMinutes: null, longRunMinutes: 90 },
};
const sessionLimited = {
  runTimeLimits: { sessionMinutes: 45, longRunMinutes: null },
};

/* The build's longest long run is the longest its weeks hold, as the plan
   builds them: a new runner's runs held to the minutes their running has
   built to (Run20 (5)), a time limit. The taper took its shares of the
   ramp's peak instead, so where the build stopped short of the peak, the
   taper stepped down from a long run the build never held. A new runner's
   marathon built to 12 km and was asked for 15 two weeks before race week
   (the simulator, every season of the new runner's marathon). */
describe("the taper's long run steps down from the longest the build held (Run22)", () => {
  /** The longest long run in the weeks before the taper. */
  const buildLongest = (
    p: ReturnType<typeof built>,
    distance: RacePlanV2Input["raceGoal"]["distance"]
  ) =>
    Math.max(
      0,
      ...p.weeks
        .slice(0, p.weeks.length - 1 - TAPER_WEEKS_BY_DISTANCE[distance])
        .map(longKm)
    );

  it("a new runner's taper takes its shares of the longest long run their build reached", () => {
    for (const [distance, weeks] of [
      ["marathon", 20],
      ["half", 16],
    ] as const) {
      const p = built(distance, weeks, newRunner);
      const out = fromRaceWeek(p);
      const longest = buildLongest(p, distance);
      const at = `${distance} in ${weeks} weeks`;
      // The run-walk weeks and the minutes after them hold the build short
      // of the plan's peak.
      expect(longest, at).toBeGreaterThan(0);
      expect(longest, at).toBeLessThan(
        buildLongest(built(distance, weeks), distance)
      );
      if (distance === "marathon")
        expect(longKm(out(3)), `${at}: 3 weeks out`).toBe(
          largestAtMost(longest * 0.75)
        );
      expect(longKm(out(2)), `${at}: 2 weeks out`).toBe(
        largestAtMost(longest * 0.6)
      );
      for (const weeksOut of [3, 2, 1])
        expect(
          longKm(out(weeksOut)),
          `${at}: ${weeksOut} weeks out`
        ).toBeLessThanOrEqual(longest);
    }
  });

  it("a compressed plan whose time limit holds the build short takes its shares of that", () => {
    // A 90-minute limit holds a marathon's long runs to 15 km; a race this
    // close builds to the 25 km peak without one. Six weeks out no longer
    // does: climbing a rung a week (Run23), its build reaches 15 km itself.
    for (const weeks of [8, 11]) {
      const p = built("marathon", weeks, timeLimited);
      const out = fromRaceWeek(p);
      const longest = buildLongest(p, "marathon");
      const at = `${weeks} weeks`;
      expect(p.compressed, at).toBe(true);
      expect(longest, at).toBeLessThan(
        buildLongest(built("marathon", weeks), "marathon")
      );
      expect(longKm(out(3)), `${at}: 3 weeks out`).toBe(
        largestAtMost(longest * 0.75)
      );
      expect(longKm(out(2)), `${at}: 2 weeks out`).toBe(
        largestAtMost(longest * 0.6)
      );
    }
  });

  it("a build that held no long run keeps none in its taper", () => {
    // A new runner with a marathon eleven and twelve weeks out: six weeks
    // of run-walk, then runs too short to be a long run, so no taper week
    // has a long run to take a share of.
    for (const weeks of [11, 12]) {
      const p = built("marathon", weeks, newRunner);
      const out = fromRaceWeek(p);
      // The same race, for a runner whose build held long runs, keeps one.
      expect(longKm(fromRaceWeek(built("marathon", weeks))(2))).toBeGreaterThan(
        0
      );
      expect(buildLongest(p, "marathon"), `${weeks} weeks`).toBe(0);
      for (const weeksOut of [3, 2, 1]) {
        const at = `${weeks} weeks: ${weeksOut} weeks out`;
        expect(longKm(out(weeksOut)), at).toBe(0);
        // The long run's day keeps a run.
        expect(out(weeksOut).length, at).toBe(out(weeksOut + 1).length);
      }
    }
  });

  it("each taper week, built at its rollover, takes its share of the same longest", () => {
    // The rollover builds a taper week with its build weeks behind it, in
    // none of the weeks the plan it builds holds.
    for (const [distance, weeks, more] of [
      ["marathon", 20, newRunner],
      ["marathon", 20, { ...newRunner, ...runDays(4) }],
      ["half", 16, newRunner],
      ["half", 16, { ...newRunner, ...runDays(5) }],
      ["marathon", 12, newRunner],
      ["marathon", 8, timeLimited],
      ["marathon", 20, { ...sessionLimited, ...runDays(4) }],
      ["marathon", 20, {}],
    ] as const) {
      const p = built(distance, weeks, more);
      for (
        let at = weeks - 1 - TAPER_WEEKS_BY_DISTANCE[distance];
        at < weeks;
        at++
      )
        expect(
          built(distance, weeks, more, at).weeks[0],
          `${distance} in ${weeks} weeks, week ${at}`
        ).toEqual(p.weeks[at]);
    }
  });

  it("a build that reached the plan's peak keeps the taper it had", () => {
    // Pinned as numbers, three and two weeks before race week: only a build
    // its fits held short of the peak steps down from less.
    const marathons: [string, Partial<RacePlanV2Input>, number, number][] = [
      ["standard", {}, 15, 15],
      [
        "lighter",
        { tuning: { volume: "lighter", difficulty: "standard" } },
        15,
        12,
      ],
      [
        "bigger",
        { tuning: { volume: "bigger", difficulty: "standard" } },
        15,
        15,
      ],
      ["a 5:00/km easy pace", { easyPaceSPerKm: 300 }, 20, 15],
      ["a 7:00/km easy pace", { easyPaceSPerKm: 420 }, 15, 12],
      ["detrained", { recentLayoff: "detrained" }, 8, 6],
    ];
    for (const weeks of [8, 17, 29, 43])
      for (const [label, more, three, two] of marathons) {
        // Eight weeks is too few for a 5:00/km runner to climb a rung a week
        // to 30 km (Run23): the build peaks at 25, and the taper takes 15 and
        // 15 of that.
        const short = weeks === 8 && label === "a 5:00/km easy pace";
        const out = fromRaceWeek(built("marathon", weeks, more));
        const at = `a marathon ${weeks} weeks out, ${label}`;
        expect(longKm(out(3)), at).toBe(short ? 15 : three);
        expect(longKm(out(2)), at).toBe(two);
      }
    const halves: [string, Partial<RacePlanV2Input>, number][] = [
      ["standard", {}, 12],
      ["lighter", { tuning: { volume: "lighter", difficulty: "standard" } }, 8],
    ];
    for (const weeks of [12, 17, 29])
      for (const [label, more, two] of halves)
        expect(
          longKm(fromRaceWeek(built("half", weeks, more))(2)),
          `a half ${weeks} weeks out, ${label}`
        ).toBe(two);
    // A time limit the ramp stays under, and a block with no room to ramp:
    // the build's longest is its base, 12 km.
    const out = fromRaceWeek(built("marathon", 5, timeLimited));
    expect([longKm(out(3)), longKm(out(2))]).toEqual([8, 6]);
  });
});

/* Run22 (2): the easy runs step down the same way, 75% then 60% of the last
   build week's easy minutes, and those are the minutes that week holds as
   the plan builds it: a new runner's runs held to the minutes their running
   has built to, a time limit on a session. Taken from the ramp's last week
   instead, the steps came off minutes the week never held: a new runner's
   marathon kept, three weeks before race week, the 60-minute medium-long
   its last build week held, beside a 45-minute long run. */
describe("the taper's easy runs step down from what the last build week held (Run22)", () => {
  /** The easy runs of the week before a plan's taper. */
  const lastBuildEasy = (
    p: ReturnType<typeof built>,
    distance: RacePlanV2Input["raceGoal"]["distance"]
  ) => easyMinutes(fromRaceWeek(p)(TAPER_WEEKS_BY_DISTANCE[distance] + 1));

  it("take the lock's shares of what the last build week held, and never run longer", () => {
    for (const [distance, weeks, more, who] of [
      ["marathon", 20, newRunner, "a new runner"],
      ["half", 16, newRunner, "a new runner"],
      ["marathon", 20, sessionLimited, "a 45-minute session limit"],
    ] as const)
      for (const days of [3, 4, 5]) {
        const p = built(distance, weeks, { ...more, ...runDays(days) });
        const out = fromRaceWeek(p);
        const taper = TAPER_WEEKS_BY_DISTANCE[distance];
        const held = lastBuildEasy(p, distance);
        const at = `${who}, a ${distance} ${weeks} weeks out, ${days} days`;
        // The fits hold the last build week's medium-long short of the
        // plan's own.
        expect(Math.max(...held), at).toBeLessThan(
          Math.max(
            ...lastBuildEasy(built(distance, weeks, runDays(days)), distance)
          )
        );
        for (const [weeksOut, share] of [
          [3, 0.75],
          [2, 0.6],
        ] as const) {
          if (weeksOut > taper) continue;
          const week = easyMinutes(out(weeksOut));
          // The medium-long, then the shortest easy run.
          expect(Math.max(...week), `${at}: ${weeksOut} weeks out`).toBe(
            easyAtMost(Math.max(...held) * share)
          );
          expect(Math.min(...week), `${at}: ${weeksOut} weeks out`).toBe(
            easyAtMost(Math.min(...held) * share)
          );
        }
        for (let weeksOut = taper; weeksOut >= 1; weeksOut--) {
          const week = easyMinutes(out(weeksOut));
          expect(
            Math.max(...week),
            `${at}: ${weeksOut} weeks out`
          ).toBeLessThanOrEqual(Math.max(...held));
          expect(
            Math.min(...week),
            `${at}: ${weeksOut} weeks out`
          ).toBeLessThanOrEqual(Math.min(...held));
        }
      }
  });

  it("a plan whose fits left its easy runs alone keeps the taper's easy runs it had", () => {
    // Pinned as numbers: each stepped taper week's easy runs in minutes,
    // shortest first, three weeks out | two weeks out.
    const plans: [
      RacePlanV2Input["raceGoal"]["distance"],
      "standard" | "lighter",
      number,
      string,
    ][] = [
      ["marathon", "standard", 3, "60 | 50"],
      ["marathon", "standard", 4, "30 60 | 30 50"],
      ["marathon", "standard", 5, "30 30 60 | 30 30 50"],
      ["marathon", "lighter", 3, "50 | 40"],
      ["marathon", "lighter", 4, "30 50 | 30 40"],
      ["marathon", "lighter", 5, "30 30 50 | 30 30 40"],
      ["half", "standard", 3, "40"],
      ["half", "standard", 4, "30 40"],
      ["half", "standard", 5, "30 30 40"],
      ["half", "lighter", 3, "30"],
      ["half", "lighter", 4, "30 30"],
      ["half", "lighter", 5, "30 30 30"],
    ];
    const stepped = (p: ReturnType<typeof built>, taper: number) =>
      Array.from({ length: taper - 1 }, (_, i) =>
        easyMinutes(fromRaceWeek(p)(taper - i))
          .sort((a, b) => a - b)
          .join(" ")
      ).join(" | ");
    for (const weeks of [17, 29])
      for (const [distance, volume, days, easy] of plans)
        expect(
          stepped(
            built(distance, weeks, {
              ...runDays(days),
              tuning: { volume, difficulty: "standard" },
            }),
            TAPER_WEEKS_BY_DISTANCE[distance]
          ),
          `a ${distance} ${weeks} weeks out, ${volume}, ${days} days`
        ).toBe(easy);
    // A compressed marathon ten weeks out builds to the same easy runs.
    expect(stepped(built("marathon", 10), 3)).toBe("30 60 | 30 50");
  });
});
