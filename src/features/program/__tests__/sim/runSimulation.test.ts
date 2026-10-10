/**
 * The running half of the training simulator: runners walked through a
 * season by the app's own code (`runDriver.ts`), and what the app shows them
 * for it. Each runner does exactly what they are told unless a test says
 * otherwise, so anything left unticked is the app disagreeing with itself.
 *
 * Measured 2026-10-10. What holds, from VDOT 30 to 60 (a 30:41 to a 17:03
 * 5K, by the app's own predictions):
 *
 *   - every easy, long and race day run as prescribed is ticked, and
 *     "This week" counts every run;
 *   - a race run on race day enters recovery that night, ending one, two,
 *     three or four weeks on (5K to marathon), and every recovery week is
 *     easy running;
 *   - a race saved without its template still enters recovery: the
 *     untemplated race-morning save `raceDayCompletion.js` records fixing
 *     stays fixed.
 *
 * What does not. Each is pinned below as the app behaves today, so a fix
 * turns its test red and the change is recorded here on purpose.
 *
 * 1. A quality day is ticked only when the whole run averaged under
 *    4:30/km. The claim map's pace bar (`runClaims.ts`) reads the saved
 *    run's average, warm-up, recoveries and cool-down included, so a
 *    session run exactly as prescribed clears it only for fast runners
 *    (recoveries jogged; walked, every average here is slower still):
 *
 *        session              first VDOT whose run ticks    their 5K
 *        4x1k, 5x1k, 6x1k     50                            19:56
 *        tempo_20, _30, _40   52                            19:17
 *        8x400                55                            18:22
 *
 *    A 20:38 5K runner's tempo and interval days are never ticked, while
 *    "This week" counts the same runs as done. Without a benchmark the
 *    tempo is prescribed at 4:30/km, the bar itself, so the warm-up and
 *    cool-down carry the average over it for anyone whose easy running is
 *    slower than that, a 17:03 5K runner included: their tempo never ticks.
 *
 * 2. Nothing ends a race plan. The first Monday after the race, or after
 *    recovery, rolls the week into free running and deletes `runPlan`
 *    (`nextRunWeek`, whose result the rollover commits whole). The
 *    server's sweep reads `runPlan` for each of its race-day decisions, so
 *    after that Monday none of them can fire:
 *      - recovery never ends. The race goal stays set and the profile
 *        `race_prep`, for every distance. "Recovery complete. What's
 *        next?" shows only until that Monday; after it Train shows the
 *        "Race day has passed" banner its code calls a legacy fallback,
 *        dismissible a week at a time;
 *      - a race skipped on a Friday, Saturday or Sunday is never marked a
 *        no-show: the sweep waits three days, and the Monday comes first.
 *        One skipped Monday to Thursday is marked (for a runner on UTC)
 *        and never cleared: the return to free running two weeks on reads
 *        the plan that Monday deleted.
 *
 * 3. A run done a day late. A planned run can be claimed a day late, but a
 *    late run on a day with its own planned run is claimed by that day's,
 *    and Sunday's run is gone from the plan by Monday. A runner who does
 *    every session of a four-day week a day late sees two ticks a week
 *    against "4 of 4".
 *
 * 4. A race the watch reads at 94% is ticked (the claim map wants 70% of
 *    the distance) and enters no recovery (the server wants 95%). The two
 *    bars differ on purpose (`raceDayCompletion.js`); between them sits a
 *    race the app shows as run, and the next Monday the runner has no
 *    plan at all.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import {
  walkSeason,
  type PlannedRunRecord,
  type RaceDistance,
  type Runner,
} from "./runDriver";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterAll(() => {
  vi.useRealTimers();
});

/** Runs on Sunday, Tuesday, Wednesday and Friday; lifts on three days. */
const FOUR_RUNS: ScheduleDay[] = [
  { day: 0, type: "run" },
  { day: 1, type: "rest" },
  { day: 2, type: "run" },
  { day: 3, type: "both" },
  { day: 4, type: "lift" },
  { day: 5, type: "run" },
  { day: 6, type: "lift" },
];

/** A Sunday race, and the Monday twenty weeks before it. */
const RACE = "2026-11-29";
const START = "2026-07-13";

const RECOVERY_WEEKS: Record<RaceDistance, number> = {
  "5k": 1,
  "10k": 2,
  half: 3,
  marathon: 4,
};

const shift = (day: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(day), days));

function walk(runner: Runner, end: string, start = START) {
  return walkSeason({
    runner,
    start,
    end,
    setClock: (at) => vi.setSystemTime(at),
  });
}

function racer(
  vdot: number,
  distance: RaceDistance,
  more: Partial<Runner> = {}
): Runner {
  return {
    vdot,
    benchmarked: true,
    weekSchedule: FOUR_RUNS,
    raceGoal: { distance, targetDate: RACE },
    ...more,
  };
}

const isQuality = (p: PlannedRunRecord) =>
  p.type === "tempo" || p.type === "intervals";

describe("a runner who does what they are told", () => {
  it("has every easy, long and race day ticked, and every run counted", () => {
    for (const vdot of [30, 40, 50, 60]) {
      const season = walk(racer(vdot, "half"), RACE);
      const plain = season.planned.filter((p) => !isQuality(p));
      expect(plain.length).toBeGreaterThan(50);
      expect(plain.filter((p) => p.completion !== "real")).toEqual([]);
      for (const week of season.weeks) {
        expect(week.runs.done).toBe(week.runs.planned);
      }
    }
  });

  it("ticks a run marked done by hand, and counts it in the week", () => {
    const season = walk(
      racer(45, "half", {
        onPlannedRun: (run) =>
          run.type === "easy" ? { kind: "mark" } : { kind: "run" },
      }),
      shift(START, 27)
    );
    const marked = season.planned.filter((p) => p.action === "mark");
    expect(marked.length).toBeGreaterThan(4);
    expect(marked.filter((p) => p.completion !== "manual")).toEqual([]);
    for (const week of season.weeks) {
      expect(week.runs.done).toBe(week.runs.planned);
      expect(week.ticked).toBe(week.runs.planned);
    }
  });

  it("enters recovery on race night, for the distance's weeks, all easy", () => {
    for (const distance of ["5k", "10k", "half", "marathon"] as const) {
      const weeks = RECOVERY_WEEKS[distance];
      const season = walk(racer(45, distance), shift(RACE, weeks * 7));
      expect(season.events).toContainEqual({
        date: RACE,
        what: `recovery entered, to ${shift(RACE, weeks * 7)}`,
      });
      const after = season.planned.filter((p) => p.date > RACE);
      expect(after).toHaveLength(weeks * 4);
      expect(new Set(after.map((p) => p.type))).toEqual(new Set(["easy"]));
    }
  });

  it("enters recovery for a race saved without its template", () => {
    const season = walk(
      racer(45, "10k", {
        onPlannedRun: (run) =>
          run.type === "race"
            ? { kind: "run", launch: "start" }
            : { kind: "run" },
      }),
      RACE
    );
    const race = season.documents.find((doc) => doc.date === RACE);
    expect(race?.actualTemplateId).toBeNull();
    expect(season.events).toContainEqual({
      date: RACE,
      what: `recovery entered, to ${shift(RACE, 14)}`,
    });
  });
});

describe("findings: the app as it behaves today", () => {
  it("ticks a quality day only under a 4:30/km average: from VDOT 50, 52 or 55", () => {
    const firstTicked: Record<string, number> = {};
    for (const vdot of [30, 35, 40, 45, 48, 50, 52, 55, 60]) {
      for (const distance of ["10k", "half"] as const) {
        const season = walk(racer(vdot, distance), shift(RACE, -1));
        for (const p of season.planned.filter(isQuality)) {
          expect(p.run).toBeDefined();
          if (p.completion) firstTicked[p.templateId] ??= vdot;
          // All or nothing: the same session at the same fitness always
          // averages the same.
          if (firstTicked[p.templateId] !== undefined) {
            expect(p.completion).toBe("real");
          }
        }
      }
    }
    expect(firstTicked).toEqual({
      "4x1k": 50,
      "5x1k": 50,
      "6x1k": 50,
      tempo_20: 52,
      tempo_30: 52,
      tempo_40: 52,
      "8x400": 55,
    });
  });

  it("counts a 20:38 5K runner's quality runs in the week, and ticks none", () => {
    const season = walk(racer(48, "half"), shift(RACE, -1));
    const quality = season.planned.filter(isQuality);
    expect(quality.length).toBeGreaterThan(10);
    expect(quality.filter((p) => p.completion !== null)).toEqual([]);
    const withQuality = season.weeks.filter((week) =>
      quality.some(
        (p) => week.weekKey <= p.date && p.date <= shift(week.weekKey, 6)
      )
    );
    for (const week of withQuality) {
      expect(week.runs.done).toBe(week.runs.planned);
      expect(week.ticked).toBeLessThan(week.runs.done);
    }
  });

  it("never ticks a tempo without a benchmark, prescribed at the bar itself", () => {
    const season = walk(
      racer(60, "half", { benchmarked: false }),
      shift(RACE, -1)
    );
    const tempos = season.planned.filter((p) => p.type === "tempo");
    expect(tempos.length).toBeGreaterThan(3);
    expect(tempos.filter((p) => p.completion !== null)).toEqual([]);
  });

  it("never ends recovery: the Monday after it deletes the plan the server reads", () => {
    for (const distance of ["5k", "10k", "half", "marathon"] as const) {
      const season = walk(racer(45, distance), shift(RACE, 8 * 7));
      expect(season.events.map((e) => e.what)).not.toContain(
        "recovery ended → freeform"
      );
      expect(season.programState.runPlan).toBeUndefined();
      expect(season.programState.runDays).toEqual([]);
      expect(season.profile.runMode).toBe("race_prep");
      expect(season.profile.raceGoal).toEqual({
        distance,
        targetDate: RACE,
      });
    }
  });

  it("marks a skipped race a no-show only Monday to Thursday, and never clears it", () => {
    const noShows: string[] = [];
    // Monday 23 November to Sunday 29 November.
    for (let i = 0; i < 7; i++) {
      const raceDate = shift("2026-11-23", i);
      const weekday = parseLocalDate(raceDate).getDay();
      const schedule: ScheduleDay[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        day,
        type: [weekday, (weekday + 3) % 7, (weekday + 5) % 7].includes(day)
          ? "run"
          : "rest",
      }));
      const season = walk(
        {
          vdot: 45,
          benchmarked: true,
          weekSchedule: schedule,
          raceGoal: { distance: "5k", targetDate: raceDate },
          onPlannedRun: (run) =>
            run.type === "race" ? { kind: "skip" } : { kind: "run" },
        },
        shift(raceDate, 30),
        "2026-10-05"
      );
      const noShow = season.events.find((e) => e.what === "no-show");
      if (noShow) {
        expect(noShow.date).toBe(shift(raceDate, 4));
        noShows.push(raceDate);
      }
      expect(season.profile.runMode).toBe("race_prep");
      expect(season.profile.raceGoal?.targetDate).toBe(raceDate);
    }
    expect(noShows).toEqual([
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
    ]);
  });

  it("ticks two of four runs done a day late, and never Sunday's", () => {
    const season = walk(
      racer(55, "half", {
        onPlannedRun: () => ({ kind: "run", daysLate: 1 }),
      }),
      "2026-11-08",
      "2026-10-05"
    );
    const sundays = season.planned.filter(
      (p) => parseLocalDate(p.date).getDay() === 0
    );
    expect(sundays.length).toBeGreaterThan(3);
    expect(sundays.filter((p) => p.completion !== null)).toEqual([]);
    // Every week after the first, which starts with no Sunday run owed.
    for (const week of season.weeks.slice(1)) {
      expect(week.runs).toMatchObject({ done: 4, planned: 4 });
      expect(week.ticked).toBe(2);
    }
  });

  it("ticks a race the watch reads at 94%, and enters no recovery", () => {
    const season = walk(
      racer(45, "10k", {
        onPlannedRun: (run) =>
          run.type === "race"
            ? { kind: "run", distanceScale: 0.94 }
            : { kind: "run" },
      }),
      shift(RACE, 7)
    );
    expect(season.planned.find((p) => p.date === RACE)?.completion).toBe(
      "real"
    );
    expect(season.events.map((e) => e.what)).toEqual([]);
    expect(season.programState.runPlan).toBeUndefined();
    expect(season.programState.runDays).toEqual([]);
  });
});
