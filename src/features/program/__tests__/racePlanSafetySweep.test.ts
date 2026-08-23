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
import { generateRacePlanV2 } from "@/features/program/runScheduler";
import type { ScheduleDay } from "@/lib/scheduleUtils";

const DAY = 86_400_000;
const SUNDAY = Date.UTC(2026, 0, 4);
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
  /** Shift week 0's Sunday so the race lands on a different weekday. */
  startOffsetDays?: number;
}) {
  const start = SUNDAY + (o.startOffsetDays ?? 0) * DAY;
  const key = (d: number) =>
    new Date(start + d * DAY).toISOString().slice(0, 10);
  const daysOut = o.daysOut ?? (o.weeksOut ?? 1) * 7;
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
       This used to emit easy_30 on 12th, 13th and 14th January: three runs in
       the 72 hours after a marathon. */
    const { out, raceDate } = plan({ distance: "marathon", weeksOut: 1 });
    const week = out.weeks[out.weeks.length - 1];
    const race = week.find((r) => r.type === "race")!;
    expect(race.date).toBe(raceDate);
    expect(race.dayIndex).toBe(0);

    expect(week.filter((r) => r.type !== "race" && r.date! > raceDate)).toEqual(
      []
    );
    // Race day at slot 0 means there is no room for a shakeout before it.
    expect(week).toHaveLength(1);
  });

  it("still schedules the shakeouts that fall BEFORE race day", () => {
    /* The other side, so the filter is not mistaken for "delete the race
       week". A midweek race keeps the run-eligible days that precede it. */
    const { out, raceDate } = plan({
      distance: "half",
      daysOut: 10, // a Wednesday race, with Sun/Mon/Tue run days before it
      runDays: 4,
    });
    const week = out.weeks[out.weeks.length - 1];
    const race = week.find((r) => r.type === "race")!;
    expect(race.date).toBe(raceDate);
    /* The EXACT set, not merely a non-empty one: a Wednesday race on a
       Sun/Mon/Tue/Wed schedule keeps all three preceding days. Asserting only
       "some remain" lets an over-tight filter through — checked by mutating
       the bound to `< raceDayIndex - 1`, which silently drops the day before
       the race and passed a length-only assertion. */
    const before = week.filter((r) => r.type !== "race");
    expect(before.map((r) => r.date)).toEqual([
      "2026-01-11",
      "2026-01-12",
      "2026-01-13",
    ]);
    expect(race.dayIndex).toBe(3);
  });

  it("does not happen when the race is the last scheduled day of its week", () => {
    /* The other half, so the finding is understood rather than just counted:
       a race that lands after the week's run days gets `dayIndex: 7` and
       nothing follows it. This is what most plans look like. */
    const { out, raceDate } = plan({ distance: "marathon", weeksOut: 20 });
    const week = out.weeks[out.weeks.length - 1];
    const race = week.find((r) => r.type === "race")!;
    expect(race.dayIndex).toBe(7);
    expect(week.filter((r) => r.date! > raceDate)).toHaveLength(0);
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
    expect(longs).toEqual([
      12, 15, 15, 12, 15, 20, 20, 15, 20, 20, 25, 20, 25, 25, 25, 25,
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
