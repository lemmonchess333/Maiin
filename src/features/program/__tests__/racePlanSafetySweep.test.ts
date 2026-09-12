/**
 * Two training-safety properties of `generateRacePlanV2`, swept rather than
 * spot-checked.
 *
 * The existing race-plan tests assert specific weeks of specific plans, which
 * is how the ramp itself got built and is genuinely well-covered. What no test
 * asks is what the generator does across the WHOLE input space — every
 * distance × every race date × every weekday the race can fall on. Two things
 * fall out that a spot check cannot see, and both are recorded here as
 * measurements. Neither is changed: each is a training-policy call, and
 * `docs/training-programming-claude-handoff.md` bars inferring one here.
 *
 * ── 1. 28.4% of plans schedule runs AFTER race day ──
 *
 * The race week keeps its full complement of scheduled easy runs, and any
 * whose weekday falls after the race lands post-race. For a Sunday race with
 * a Sun/Mon/Tue/Wed run schedule that is THREE runs in the 72 hours after the
 * race — and Sunday is when most road races are held.
 *
 * Nothing downstream removes them, which is the part worth knowing.
 * `scheduleRecoveryWeekV2` replaces the runDays of the week AFTER the race
 * (`useProgram`'s rollover branch), so the race week's own tail survives
 * untouched. The codebase already holds a post-race recovery policy —
 * `recoveryWeeksForDistance`, the `recovery` phase, the recovery-entry
 * trigger — so this is an internal inconsistency rather than a missing
 * opinion: the plan commits to recovery starting the following week, and
 * schedules marathon +1, +2 and +3 as training days.
 *
 * The severity is distance-dependent in a way the uniform 28.4% hides. An
 * easy 30 the day after a 5K is ordinary; three of them after a marathon is
 * not. If this gets fixed, the distance is the axis that matters.
 *
 * ── 2. A compressed plan doubles the long run in one week ──
 *
 *   distance   plan      long run       jump
 *   marathon   6 weeks   12 km → 25 km  +108%
 *   half       5 weeks   10 km → 20 km  +100%
 *   10K        4 weeks    6 km → 12 km  +100%
 *   5K         4 weeks    6 km →  8 km   +33%
 *
 * This is the compressed-but-above-floor band specifically, and the contrast
 * with its neighbours is what makes it look like a gap rather than a choice.
 * BELOW the floor the generator already has a safety answer — all easy, no
 * quality, no long ramp at all. ABOVE it, a full-length plan ramps in ~25-33%
 * steps with down weeks (12→15→15→12→15→20→20→15→20→20→25 for a 20-week
 * marathon). Only the middle band has a single build week that doubles.
 *
 * Note 25-33% steps are NOT the alarming thing and this file does not treat
 * them as such: the 10%-per-week guideline is about weekly VOLUME, and
 * 12 km → 15 km is a standard long-run progression. The finding is the
 * doubling, not the ramp.
 *
 * ── What was checked and found correct ──
 *
 * `RACE_CONFIGS.marathon.peakLongKm` is 32 while the generator never emits
 * past 25 km, which looks like a discrepancy and is not: `long_30k` is 170
 * minutes, `LONG_RUN_MAX_MINUTES` is Daniels' 150, so the tier is registry-
 * only by design and already asserted elsewhere. Pinned below anyway, since
 * it is the kind of gap a future reader will re-derive.
 */
import { describe, it, expect } from "vitest";
import {
  generateRacePlanV2,
  raceTrainingWeeks,
} from "@/features/program/runScheduler";
import type { ScheduleDay } from "@/lib/scheduleUtils";

const DAY = 86_400_000;
/** Mon 5 Jan 2026 — the week anchor (RunWk2). Every plan below starts
 *  on-anchor, the shape production hands the scheduler; the exhaustive
 *  sweep still walks `startOffsetDays` 0..6 so off-anchor starts are
 *  exercised too. */
const MONDAY = Date.UTC(2026, 0, 5);
const RACE_DISTANCES = ["5k", "10k", "half", "marathon"] as const;
type RaceDistance = (typeof RACE_DISTANCES)[number];

/** Run on the first `n` days of the week; rest after. */
const sched = (n: number): ScheduleDay[] =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    type: day < n ? "run" : "rest",
  })) as ScheduleDay[];

/** Long-run distance encoded in a template id (`long_25k` → 25). */
const longKmOf = (templateId: string): number => {
  const m = /^long_(\d+)k$/.exec(templateId);
  return m ? parseInt(m[1], 10) : 0;
};

function plan(o: {
  distance: RaceDistance;
  weeksOut?: number;
  daysOut?: number;
  runDays?: number;
  /** Shift week 0's start so the race lands on a different weekday. */
  startOffsetDays?: number;
}) {
  const start = MONDAY + (o.startOffsetDays ?? 0) * DAY;
  const key = (d: number) =>
    new Date(start + d * DAY).toISOString().slice(0, 10);
  // `weeksOut: N` is an N-week plan: the race on the Sunday that closes week
  // N-1, the weekend race every distance's fixtures assume. `N * 7` would put
  // it on the Monday that OPENS week N — a real plan of N+1 calendar weeks
  // whose last week is the race alone, pinned below as its own case.
  const daysOut = o.daysOut ?? (o.weeksOut ?? 1) * 7 - 1;
  const runDays = o.runDays ?? 4;
  return {
    raceDate: key(daysOut),
    out: generateRacePlanV2({
      weekSchedule: sched(runDays),
      raceGoal: { distance: o.distance, targetDate: key(daysOut) },
      weeklyRunDays: runDays,
      currentDate: key(0),
      weekStart: key(0),
      recentLayoff: "none",
    }),
  };
}

/** Long run per week, 0 where a week has none. */
const longRuns = (weeks: { templateId: string }[][]) =>
  weeks.map((w) => Math.max(0, ...w.map((r) => longKmOf(r.templateId))));

describe("race plans — nothing is scheduled after race day", () => {
  it("holds across every distance, race date and weekday", () => {
    let total = 0;
    let withRunsAfter = 0;
    const perDistance = new Map<string, { n: number; bad: number }>();

    // Every weekday the race can fall on × three weeks out to thirty.
    for (let startOffsetDays = 0; startOffsetDays < 7; startOffsetDays++) {
      for (const distance of RACE_DISTANCES) {
        for (let daysOut = 3; daysOut <= 210; daysOut++) {
          const { out, raceDate } = plan({
            distance,
            daysOut,
            startOffsetDays,
          });
          const after = out.weeks
            .flat()
            .filter((r) => r.type !== "race" && r.date && r.date > raceDate);
          total++;
          const d = perDistance.get(distance) ?? { n: 0, bad: 0 };
          d.n++;
          if (after.length > 0) {
            withRunsAfter++;
            d.bad++;
          }
          perDistance.set(distance, d);
        }
      }
    }

    expect(total).toBe(5824);
    /* Was 1652 (28.4%), and identically 413 per distance — a calendar
       property, not a distance rule, which is why the marathon case was
       unguarded. The race week now keeps only the shakeouts BEFORE race day. */
    expect(withRunsAfter).toBe(0);
    for (const [distance, d] of perDistance) {
      expect(d.bad, distance).toBe(0);
    }
  });

  it("leaves a Sunday marathon week with the race and nothing after it", () => {
    /* The concrete worst case, and the modal one — most road races are on a
       Sunday, and a Sun/Mon/Tue/Wed schedule is an ordinary four-day week.
       This used to emit easy_30 in the 72 hours AFTER a marathon.

       Under the old Sunday anchor the race opened its week, so every other
       run day followed it and the only safe week was the race alone. Under
       the Monday anchor Sunday CLOSES the week: Mon/Tue/Wed now precede the
       race and are legitimate shakeouts, so the week holds four runs — and
       the safety property is unchanged, nothing after race day. */
    const { out, raceDate } = plan({ distance: "marathon", daysOut: 6 });
    const week = out.weeks[out.weeks.length - 1];
    const race = week.find((r) => r.type === "race")!;
    expect(race.date).toBe(raceDate); // Sun 2026-01-11
    expect(race.dayIndex).toBe(0);

    expect(week.filter((r) => r.type !== "race" && r.date! > raceDate)).toEqual(
      []
    );
    const before = week.filter((r) => r.type !== "race");
    expect(before.map((r) => r.date)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
    ]);
    expect(week).toHaveLength(4);
  });

  it("still schedules the shakeouts that fall BEFORE race day", () => {
    /* The other side, so the filter is not mistaken for "delete the race
       week". A midweek race keeps the run-eligible days that precede it. */
    const { out, raceDate } = plan({
      distance: "half",
      daysOut: 9, // a Wednesday race (14 Jan), on a Sun/Mon/Tue/Wed schedule
      runDays: 4,
    });
    const week = out.weeks[out.weeks.length - 1];
    const race = week.find((r) => r.type === "race")!;
    expect(race.date).toBe(raceDate);
    /* The EXACT set, not merely a non-empty one. Asserting only "some
       remain" lets an over-tight filter through — checked by mutating the
       bound to `< raceDayOffset - 1`, which silently drops the day before
       the race and passed a length-only assertion.

       Under the Monday anchor the race week is Mon 12 – Sun 18 Jan, so of
       a Sun/Mon/Tue/Wed schedule only Mon 12 and Tue 13 precede the race;
       the schedule's Sunday is the 18th, AFTER it, and is correctly cut.
       (Under Sunday weeks the same schedule kept Sun 11 as well.) */
    const before = week.filter((r) => r.type !== "race");
    expect(before.map((r) => r.date)).toEqual(["2026-01-12", "2026-01-13"]);
    expect(race.dayIndex).toBe(3);
  });

  it("does not happen when the race is the last scheduled day of its week", () => {
    /* The other half, so the finding is understood rather than just counted:
       a race that lands after the week's run days keeps every shakeout and
       nothing follows it. This is what most plans look like.

       This used to assert `race.dayIndex === 7` — an offset sentinel that
       leaked out of the arithmetic and pinned the Sunday coincidence rather
       than the behaviour. The race day now carries its real weekday, and the
       claims that matter are that it sits ON race day and is the last thing
       in the plan. */
    const { out, raceDate } = plan({ distance: "marathon", weeksOut: 20 });
    const week = out.weeks[out.weeks.length - 1];
    const race = week.find((r) => r.type === "race")!;
    expect(race.date).toBe(raceDate);
    expect(race.dayIndex).toBe(new Date(`${raceDate}T12:00:00`).getDay());
    expect(week.filter((r) => r.date! > raceDate)).toHaveLength(0);
  });
});

describe("race plans — the block is the calendar weeks from this week through race week", () => {
  /* `totalWeeks` used to be `ceil((race - currentDate) / 7d)` while the weeks
     were laid out from the week's FIRST day. The two origins agree only when
     the plan starts on that day and the race is not on one; every other
     combination undercounted by one, which put the race a week past the
     final week's start (and, pre-Monday-anchor, gave it the sentinel
     `dayIndex` of 7 that hid the double-booking `raceRunDayDate.run-m2`
     pins). The count is now the race's week index plus one, so these hold
     for every start weekday × race weekday, not just the on-anchor ones. */
  const weekIndexOf = (from: number, to: number) =>
    Math.floor((to - from) / (7 * DAY));
  const mondayOf = (t: number) => {
    const dow = new Date(t).getUTCDay();
    return t - ((dow + 6) % 7) * DAY;
  };

  it("every start weekday × race weekday: the race is in the last week, and nothing follows it", () => {
    for (let startOffsetDays = 0; startOffsetDays < 7; startOffsetDays++) {
      for (let daysOut = 1; daysOut <= 70; daysOut++) {
        const { out, raceDate } = plan({
          distance: "half",
          daysOut,
          startOffsetDays,
        });
        const start = MONDAY + startOffsetDays * DAY;
        const expectedWeeks =
          weekIndexOf(mondayOf(start), start + daysOut * DAY) + 1;
        const label = `start+${startOffsetDays} race+${daysOut}`;
        expect(out.weeks.length, label).toBe(
          Math.max(expectedWeeks, expectedWeeks > 1 ? 2 : 1)
        );
        expect(out.totalWeeks, label).toBe(out.weeks.length);
        const last = out.weeks[out.weeks.length - 1];
        const races = last.filter((r) => r.type === "race");
        expect(
          races.map((r) => r.date),
          label
        ).toEqual([raceDate]);
        expect(
          last.filter((r) => r.date! > raceDate),
          label
        ).toHaveLength(0);
        expect(
          last.filter((r) => r.dayIndex === races[0].dayIndex),
          label
        ).toHaveLength(1);
      }
    }
  });

  it("a Monday race exactly N weeks out is an (N+1)-week plan whose last week is the race alone", () => {
    // 42 days from a Monday start is the Monday that OPENS week 6. The old
    // count said 6 weeks and left the race a week past its plan.
    const { out, raceDate } = plan({ distance: "marathon", daysOut: 42 });
    expect(out.totalWeeks).toBe(7);
    expect(out.weeks[6].map((r) => [r.type, r.date])).toEqual([
      ["race", raceDate],
    ]);
  });

  it("raceTrainingWeeks — literal pins for the number the verdicts and the Realign preview share", () => {
    const at = (currentDate: string, targetDate: string) =>
      raceTrainingWeeks({ currentDate, targetDate });
    // Mon 5 Jan start. A Sunday race 20 days out closes week 2: 3 weeks.
    expect(at("2026-01-05", "2026-01-25")).toBe(3);
    // The Monday after it opens week 3 with nothing to train in: still 3.
    expect(at("2026-01-05", "2026-01-26")).toBe(3);
    // A Tuesday race in week 3 has a Monday to train on: 4.
    expect(at("2026-01-05", "2026-01-27")).toBe(4);
    // Declared on Sunday for a Sunday race three weeks on: the week already
    // behind the runner counts (4), the declaration-side case the block
    // does not correct — see the pin below for why that unlocks nothing.
    expect(at("2026-01-11", "2026-02-01")).toBe(4);
    // Race this week, race today, race in the past: one week, never zero.
    expect(at("2026-01-05", "2026-01-10")).toBe(1);
    expect(at("2026-01-05", "2026-01-05")).toBe(1);
    expect(at("2026-01-05", "2025-12-25")).toBe(1);
    // A Monday race next week is a 2-week block whose second week is the
    // race alone: one week to train in.
    expect(at("2026-01-05", "2026-01-12")).toBe(1);
  });

  it("a Monday race's empty last week is not training: the safety verdicts read the weeks before it", () => {
    /* Three Mondays out is a 4-week block with 3 weeks to train in. Read as
       block weeks, a marathon sat AT the 4-week floor (compressed, quality
       gated off but not the finish-safely shape) and a 5k came back
       "healthy" — with 6x1k and 8x400 in it — for a runner with three weeks.
       The verdicts read the training weeks; the layout keeps the race's
       week. Same verdicts as the Sunday race one day earlier, which is the
       3-week block every other fixture here uses. */
    const mondayMarathon = plan({ distance: "marathon", daysOut: 21 });
    const sundayMarathon = plan({ distance: "marathon", daysOut: 20 });
    expect(mondayMarathon.out.totalWeeks).toBe(4);
    expect(sundayMarathon.out.totalWeeks).toBe(3);
    expect(mondayMarathon.out.belowFloor).toBe(true);
    expect(mondayMarathon.out.belowFloor).toBe(sundayMarathon.out.belowFloor);

    const monday5k = plan({ distance: "5k", daysOut: 21 });
    const sunday5k = plan({ distance: "5k", daysOut: 20 });
    expect(monday5k.out.compressed).toBe(true);
    expect(monday5k.out.belowFloor).toBe(false);
    expect([monday5k.out.compressed, monday5k.out.belowFloor]).toEqual([
      sunday5k.out.compressed,
      sunday5k.out.belowFloor,
    ]);
    const types = (p: typeof monday5k) =>
      new Set(p.out.weeks.flat().map((r) => r.type));
    expect(types(monday5k)).toEqual(new Set(["easy", "long", "race"]));
  });

  it("declared on the week's last day, the week already behind the runner counts — and unlocks nothing", () => {
    /* A Sunday declaration is a calendar week with no training day left in
       it. The block counts it (the rail shows it; the race's week index is
       what it is), so a marathon declared three Sundays before a Sunday race
       is a 4-week block — at the floor, not below it — where the from-today
       count said 3. What matters for the runner is that the extra week is
       made of days already gone: every runDay from today to the race is
       easy, exactly as the Monday declaration's below-floor plan is. The
       verdict label differs; the training does not. */
    const sunday = plan({
      distance: "marathon",
      startOffsetDays: 6, // Sun 11 Jan
      daysOut: 21, // Sun 1 Feb
    });
    const monday = plan({
      distance: "marathon",
      startOffsetDays: 7, // Mon 12 Jan
      daysOut: 20, // Sun 1 Feb
    });
    expect(sunday.raceDate).toBe(monday.raceDate);
    expect(sunday.out.totalWeeks).toBe(4);
    expect(sunday.out.belowFloor).toBe(false);
    expect(monday.out.totalWeeks).toBe(3);
    expect(monday.out.belowFloor).toBe(true);
    const ahead = (p: typeof sunday) =>
      p.out.weeks
        .flat()
        .filter((r) => r.date! >= "2026-01-12")
        .map((r) => `${r.date}:${r.templateId}`);
    expect(ahead(sunday)).toEqual(ahead(monday));
    expect(new Set(ahead(sunday).map((k) => k.split(":")[1]))).toEqual(
      new Set(["easy_30", "marathon_race"])
    );
  });
});

describe("race plans — the compressed band doubles the long run", () => {
  it.each([
    { distance: "marathon" as const, weeksOut: 6, from: 12, to: 25 },
    { distance: "half" as const, weeksOut: 5, from: 10, to: 20 },
    { distance: "10k" as const, weeksOut: 4, from: 6, to: 12 },
  ])(
    "$distance in $weeksOut weeks jumps $from km → $to km in one week",
    ({ distance, weeksOut, from, to }) => {
      const { out } = plan({ distance, weeksOut });
      expect(out.compressed).toBe(true);
      expect(out.belowFloor).toBe(false); // the middle band, not the safe floor
      const longs = longRuns(out.weeks);
      expect(longs[0]).toBe(from);
      expect(longs[1]).toBe(to);
      expect((to - from) / from).toBeGreaterThanOrEqual(1); // a doubling
    }
  );

  it("below the floor there is no long-run ramp at all", () => {
    /* The generator's own safety answer at the extreme — which is what makes
       the middle band look like a gap rather than a decision. */
    const { out } = plan({ distance: "marathon", weeksOut: 3 });
    expect(out.belowFloor).toBe(true);
    expect(longRuns(out.weeks)).toEqual([0, 0, 0]);
    expect(new Set(out.weeks.flat().map((r) => r.type))).toEqual(
      new Set(["easy", "race"])
    );
  });

  it("a full-length plan ramps in ordinary steps, with down weeks", () => {
    /* The contrast case, pinned so the finding above is not read as "the ramp
       is too steep". 25-33% long-run steps are standard progression; the
       doubling is the outlier. */
    const { out } = plan({ distance: "marathon", weeksOut: 20 });
    expect(out.compressed).toBe(false);
    const longs = longRuns(out.weeks).filter((k) => k > 0);
    // Run17: the curve now aims at the schedulable ceiling (25 km on the
    // nominal table, plus the 10% hold) instead of the 32 km config peak,
    // so the block spends three weeks at 25 km rather than five, and the
    // early weeks climb from base more gradually.
    expect(longs).toEqual([
      12, 12, 15, 12, 15, 15, 15, 15, 20, 20, 20, 15, 20, 25, 25, 25,
    ]);
    // No step past a third, and the sequence genuinely steps back down.
    for (let i = 1; i < longs.length; i++) {
      if (longs[i] > longs[i - 1]) {
        expect((longs[i] - longs[i - 1]) / longs[i - 1]).toBeLessThanOrEqual(
          1 / 3 + 0.001
        );
      }
    }
    expect(longs.some((k, i) => i > 0 && k < longs[i - 1])).toBe(true);
  });
});

describe("race plans — the 32 km marathon peak is registry-only, by design", () => {
  it("never prescribes past the 150-minute long-run ceiling", () => {
    /* `RACE_CONFIGS.marathon.peakLongKm` is 32 and the generator tops out at
       25 km. Not drift: `long_30k` is 170 minutes and `LONG_RUN_MAX_MINUTES`
       is 150, so the tier is pickable in the day sheet and never scheduled.
       Pinned here because it reads as a discrepancy and costs a re-derivation
       every time someone notices it. */
    for (const distance of RACE_DISTANCES) {
      for (const weeksOut of [12, 20, 30]) {
        const { out } = plan({ distance, weeksOut, runDays: 5 });
        const peak = Math.max(
          ...out.weeks.flat().map((r) => longKmOf(r.templateId))
        );
        expect(peak, `${distance} @ ${weeksOut}w`).toBeLessThanOrEqual(25);
      }
    }
    const { out } = plan({ distance: "marathon", weeksOut: 30, runDays: 5 });
    expect(out.weeks.flat().some((r) => r.templateId === "long_30k")).toBe(
      false
    );
  });
});
