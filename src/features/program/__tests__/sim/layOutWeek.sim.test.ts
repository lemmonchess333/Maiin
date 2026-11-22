/**
 * TrainWk1's season test (the Train grill's Q54): the week laid out
 * (`layOutWeek`) every morning and every evening of whole seasons, each
 * day the simulated person opens the app, from the plan and the sessions
 * the app holds then (`observeDay`). Across skipped days, lifts started on
 * other days, sessions outside the plan, breaks and every weekly rollover,
 * it holds that:
 *
 *   - a lift of the plan is never lost and never shown twice: each is
 *     once on a day, still to do, skipped, rested before a race or done off
 *     the week;
 *   - a lift is never called missed: one to do sits on a free lift day from
 *     today (a lift day, from the start, not a race's rest day), in the
 *     order the cursor offers them, or waits in Still to do;
 *   - a lift done sits on the day its saved session belongs to, and every
 *     saved session of the week is on its day once;
 *   - Train's "Up next" is the layout's next lift, and Home's card each
 *     morning names the lift the layout lays on today;
 *   - Home and Train name the same next lift (Q56), every morning and
 *     evening: the lift Home's card offers, else the first lift to do its
 *     day card names on a later day of the strip, else the one its
 *     "tomorrow" line names for next week, is Train's "Up next";
 *   - runs keep their dates: every planned run of the week once, on its
 *     date, missed only once its day has passed, and every saved run once;
 *   - the sessions drawn done are the sessions the week's count counts.
 *
 * Seed 1 for every lifting, action and running persona, at its own season
 * length, and three seeds for the people who train on other days and
 * outside the plan, whom only this suite simulates.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import { isRaceRestDay } from "@/features/program/raceRest";
import { nextUpIndex } from "@/features/program/nextUpCursor";
import { beforeStart, startDayKey } from "@/lib/startDay";
import { weekScheduleFor } from "@/lib/trainingResolver";
import { trainingWeek } from "@/lib/trainingWeek";
import {
  layOutWeek,
  planLiftOn,
  type LayoutLift,
  type LayoutRun,
  type WeekLayout,
} from "@/lib/layOutWeek";
import { todaySession } from "@/lib/todaySession";
import { scheduledDaysSinceStart } from "@/lib/startDay";
import { ACTION_PERSONAS } from "@/test/sim/actionPersonas";
import {
  LIFT_PERSONAS,
  NOVICE_MAN,
  SIX_DAYS_GENERAL,
} from "@/test/sim/liftPersonas";
import {
  simulateLiftSeason,
  type LiftPersona,
  type ObservedDay,
} from "@/test/sim/liftSeason";
import {
  HYBRID_3_4_TRIM,
  OWNER_MARATHON,
  RUN_PERSONAS,
} from "@/test/sim/runPersonas";

/** Every season runs the full suite's checks twice a day; the slowest
 *  persona takes a few seconds here, and CI runs several suites at once. */
const TIMEOUT = 120_000;

/** People who lift on days the plan did not give them, from Train, and
 *  save sessions outside the plan: what moves lifts earlier, empties a
 *  week before Sunday and puts more than one lift on a day. */
const ANY_DAY: readonly { persona: LiftPersona; weeks: number }[] = [
  {
    persona: {
      ...NOVICE_MAN,
      name: "novice-any-day",
      sessionShare: 0.6,
      actions: { liftsOnOtherDays: 0.5, outsidePlan: 0.15, skipsLifts: 0.3 },
    },
    weeks: 26,
  },
  {
    persona: {
      ...SIX_DAYS_GENERAL,
      name: "six-days-any-day",
      sessionShare: 0.7,
      actions: { liftsOnOtherDays: 0.8, outsidePlan: 0.1 },
    },
    weeks: 26,
  },
  {
    persona: {
      ...HYBRID_3_4_TRIM,
      name: "hybrid-any-day",
      actions: {
        liftsOnOtherDays: 0.3,
        outsidePlan: 0.1,
        skipsLifts: 0.3,
        skipsRuns: 0.5,
      },
    },
    weeks: 22,
  },
  {
    persona: {
      ...OWNER_MARATHON,
      name: "owner-marathon-any-day",
      actions: { liftsOnOtherDays: 0.3, skipsLifts: 0.2 },
    },
    weeks: 33,
  },
];

interface Tally {
  seasons: number;
  weeks: number;
  /** Mornings and evenings laid out. */
  days: number;
  /** Lifts of the plan found where they belong, summed over the days. */
  lifts: number;
  /** Mornings Home's card offered a lift to start, compared. */
  homeCards: number;
  /** Mornings and evenings Home named a next lift, compared with Train's
   *  (Q56): on its card, on a later day of the strip, or in its line for
   *  next week. */
  homeNext: number;
  homeNextLater: number;
  homeNextNextWeek: number;
  /** Train had a next lift and Home named none (no day left this week
   *  holds one, and the line names a run or nothing). */
  homeNextNone: number;
  runs: number;
  moved: number;
  stillToDo: number;
  skipped: number;
  raceRest: number;
  outsidePlan: number;
  doneOffWeek: number;
  doubleDays: number;
}

const newTally = (): Tally => ({
  seasons: 0,
  weeks: 0,
  days: 0,
  lifts: 0,
  homeCards: 0,
  homeNext: 0,
  homeNextLater: 0,
  homeNextNextWeek: 0,
  homeNextNone: 0,
  runs: 0,
  moved: 0,
  stillToDo: 0,
  skipped: 0,
  raceRest: 0,
  outsidePlan: 0,
  doneOffWeek: 0,
  doubleDays: 0,
});

/** Every season's, for the line the suite prints. */
const total = newTally();

const weekOf = (date: string) => localWeekKey(parseLocalDate(date));

/**
 * The cursor's order, read off its rule (`nextUpCursor.ts`) rather than
 * asked of it: the lift chosen with "Make this next" while it is still to
 * do, then the rest still to do in the plan's order.
 */
function cursorSequence(day: ObservedDay): number[] {
  const workouts = day.state.workouts;
  const toDo = (i: number) => !workouts[i].completed && !workouts[i].skipped;
  const all = workouts.map((_, i) => i).filter(toDo);
  const chosen = day.state.nextWorkoutOverride;
  return typeof chosen === "number" && chosen >= 0 && toDo(chosen)
    ? [chosen, ...all.filter((i) => i !== chosen)]
    : all;
}

/**
 * The next lift Home names, read off what Home draws from the same layout:
 * the card's lift to start (or a new lifter's first workout on a rest
 * day), else the first lift to do that the day card names on a later day
 * of the strip (`planLiftOn`, which `DayPeekCard` reads), else the lift
 * the "tomorrow" line names past Sunday. Null when Home names none.
 */
function homeNextLift(
  day: ObservedDay,
  w: WeekLayout
): { index: number; where: "card" | "later" | "next-week" } | null {
  const { date, state, profile, workouts, runs, claimMap } = day;
  const began = (
    profile.createdAt as { toMillis?: () => number } | undefined
  )?.toMillis?.();
  const session = todaySession({
    today: date,
    profile,
    programState: state,
    claimMap,
    workouts,
    week: w,
    createdAtMs: began ?? null,
    nowMs: parseLocalDate(date).getTime() + 12 * 3_600_000,
    lifetimeRuns: runs.length,
    lifetimeMeals: 0,
  });
  if (session.lift?.status === "planned" && session.lift.index !== null)
    return { index: session.lift.index, where: "card" };
  if (session.rest?.kind === "first-workout")
    return { index: session.rest.index, where: "card" };
  for (const d of w.days.filter((x) => x.date > date)) {
    const lift = planLiftOn(d);
    if (lift?.state === "planned" && lift.index !== null)
      return { index: lift.index, where: "later" };
  }
  const line = session.next?.target.match(/^\/program\?day=(\d+)$/);
  if (line && session.next && session.next.dateKey > w.days[6].date)
    return { index: Number(line[1]), where: "next-week" };
  return null;
}

/** Everything wrong with one day's layout, as lines a failure prints. */
function check(day: ObservedDay, tally: Tally): string[] {
  const { date, state, profile, workouts, runs, claimMap } = day;
  const at = `${day.moment} ${date}`;
  const weekKey = weekOf(date);
  const w: WeekLayout = layOutWeek({
    weekKey,
    today: date,
    profile,
    programState: state,
    workouts,
    runs,
    claimMap,
  });
  const out: string[] = [];
  const fail = (what: string) => out.push(`${at}: ${what}`);
  const startKey = startDayKey(profile.createdAt);
  const liftWeekdays = new Set(
    weekScheduleFor(profile)
      .filter((d) => d.type === "lift" || d.type === "both")
      .map((d) => d.day)
  );
  const days = w.days.map((d) => d.date);
  const inWeek = (d: string) => d >= days[0] && d <= days[6];

  /* ── Lifts of the plan: each once, never missed ──────────────── */
  const planLifts = w.entries.filter(
    (s): s is LayoutLift => s.sport === "lift" && s.plan
  );
  const held = planLifts.map((l) => l.index!).sort((a, b) => a - b);
  const expected = state.workouts.map((_, i) => i);
  if (held.join() !== expected.join())
    fail(`lifts held ${held.join()}, the plan has ${expected.join()}`);
  tally.lifts += new Set(held).size;
  for (const l of planLifts) {
    const plan = state.workouts[l.index!];
    if (
      !["day", "still-to-do", "skipped", "race-rest", "done-off-week"].includes(
        l.group
      )
    )
      fail(`${plan.dayName} in group ${l.group}`);
    if (l.state === "today" || l.state === "planned") {
      const d = l.date!;
      if (d < date) fail(`${plan.dayName} to do on ${d}, before today`);
      if (!liftWeekdays.has(parseLocalDate(d).getDay()))
        fail(`${plan.dayName} laid on ${d}, not a lift day`);
      if (beforeStart(d, startKey)) fail(`${plan.dayName} before the start`);
      if (isRaceRestDay(state.runPlan, d))
        fail(`${plan.dayName} on a race's rest day ${d}`);
      if ((l.state === "today") !== (d === date))
        fail(`${plan.dayName} reads ${l.state} on ${d}`);
      if (plan.completed || plan.skipped)
        fail(`${plan.dayName} laid to do, and done or skipped`);
      if (l.movedFrom !== null) tally.moved++;
    } else if (l.movedFrom !== null)
      fail(`${plan.dayName} ${l.state} says it moved`);
    if (l.state === "done") {
      const savedDay = workouts.find(
        (x) => x.id === plan.completedWorkoutId
      )?.date;
      if (l.group === "day" && l.date !== savedDay)
        fail(
          `${plan.dayName} done on ${String(l.date)}, saved ${String(savedDay)}`
        );
      if (l.group === "done-off-week" && savedDay && inWeek(savedDay))
        fail(`${plan.dayName} off the week, saved on ${savedDay}`);
    }
  }
  tally.stillToDo += w.stillToDo.length;
  tally.skipped += w.skipped.length;
  tally.raceRest += w.raceRest.length;
  tally.doneOffWeek += w.doneOffWeek.length;

  // In the cursor's order: by day, then still to do.
  const laid = planLifts
    .filter((l) => l.state === "today" || l.state === "planned")
    .sort((a, b) => (a.date! < b.date! ? -1 : 1))
    .concat(w.stillToDo)
    .map((l) => l.index!);
  const order = cursorSequence(day);
  if (laid.join() !== order.join())
    fail(`lifts to do laid ${laid.join()}, the cursor's order ${order.join()}`);
  // One lift of the plan to do per day.
  for (const d of w.days) {
    const toDo = d.sessions.filter(
      (s) =>
        s.sport === "lift" && (s.state === "today" || s.state === "planned")
    );
    if (toDo.length > 1)
      fail(`${d.date} holds ${String(toDo.length)} lifts to do`);
    if (
      toDo.length > 0 &&
      d.sessions.some((s) => s.sport === "lift" && s.plan && s.state === "done")
    )
      fail(`${d.date} holds a lift to do beside one done`);
    if (
      d.sessions.some((s) => s.sport === "lift") &&
      d.sessions.some((s) => s.sport === "run")
    )
      tally.doubleDays++;
  }

  // Train's "Up next".
  const up = nextUpIndex(state);
  if ((w.next?.index ?? -1) !== up)
    fail(
      `the layout's next is ${String(w.next?.index)}, Train's ${String(up)}`
    );

  // Q56: Home names Train's next lift, wherever it names one.
  const home = homeNextLift(day, w);
  if (home) {
    tally.homeNext++;
    if (home.where === "later") tally.homeNextLater++;
    if (home.where === "next-week") tally.homeNextNextWeek++;
    // Past Sunday Home names the lift the rollover opens with, which is
    // Train's next whenever Train has one left.
    if (up >= 0 && home.index !== up)
      fail(
        `Q56: Home names ${state.workouts[home.index]?.dayName} (${home.where}), Train's next is ${state.workouts[up]?.dayName}`
      );
  } else if (up >= 0) tally.homeNextNone++;

  // Home's card names today's lift.
  const card = day.card?.lift;
  const todays = w.days
    .find((d) => d.date === date)!
    .sessions.filter(
      (s): s is LayoutLift => s.sport === "lift" && s.state === "today"
    );
  if (day.moment === "morning") {
    if (card?.status === "planned") {
      tally.homeCards++;
      if (
        todays.length !== 1 ||
        todays[0].index !== card.index ||
        !todays[0].isNext
      )
        fail(
          `Home offers ${String(card.index)}, the layout lays ${todays.map((l) => l.index).join() || "none"} today`
        );
    } else if (todays.length > 0)
      fail(
        `Home offers no lift to start, the layout lays ${String(todays[0].index)} today`
      );
  }

  /* ── Saved sessions: each once, on its day ───────────────────── */
  for (const saved of workouts.filter((x) => inWeek(x.date))) {
    const shown = w.entries.filter(
      (s) => s.sport === "lift" && s.savedId === saved.id
    );
    if (shown.length !== 1 || shown[0].date !== saved.date)
      fail(`saved lift ${saved.id} shown ${String(shown.length)} times`);
    if (shown[0] && !shown[0].plan) tally.outsidePlan++;
  }

  /* ── Runs keep their dates ───────────────────────────────────── */
  const planned = (state.runDays ?? []).filter(
    (rd) => rd.date && inWeek(rd.date)
  );
  const dates = planned.map((rd) => rd.date!);
  if (new Set(dates).size !== dates.length)
    fail(`two planned runs on one date: ${dates.join()}`);
  for (const rd of planned) {
    const shown = w.entries.filter(
      (s): s is LayoutRun => s.sport === "run" && s.runDay?.id === rd.id
    );
    if (shown.length !== 1 || shown[0].date !== rd.date)
      fail(
        `run ${String(rd.id)} on ${rd.date!} shown ${String(shown.length)} times`
      );
    const r = shown[0];
    if (!r) continue;
    tally.runs++;
    if (r.state === "missed" && r.date >= date)
      fail(`run ${r.date} missed early`);
    if ((r.state === "today" || r.state === "planned") && r.date < date)
      fail(`run ${r.date} still to do after its day`);
  }
  for (const run of runs.filter((r) => inWeek(r.day))) {
    const shown = w.entries.filter(
      (s) => s.sport === "run" && s.savedRunId === run.id
    );
    if (shown.length !== 1)
      fail(`saved run ${run.id} shown ${String(shown.length)} times`);
  }

  /* ── The count counts what is drawn ──────────────────────────── */
  const drawn = w.days.flatMap((d) => d.sessions);
  const liftsDone = drawn.filter(
    (s) => s.sport === "lift" && s.state === "done"
  );
  const runsDone = drawn.filter(
    (s) => s.sport === "run" && s.state === "done" && s.counts
  );
  if (liftsDone.length !== w.count.lifts.done)
    fail(
      `${String(liftsDone.length)} lifts drawn done, ${String(w.count.lifts.done)} counted`
    );
  if (runsDone.length !== w.count.runs.done)
    fail(
      `${String(runsDone.length)} runs drawn done, ${String(w.count.runs.done)} counted`
    );
  // The count is trainingWeek's, and race week's planned lifts are the
  // lift days less the lifts the layout rests before the race.
  const counted = trainingWeek({
    weekKey,
    profile,
    programState: state,
    workouts,
    runs,
    now: parseLocalDate(date),
  }).lifts.planned;
  if (w.count.lifts.planned !== counted)
    fail(
      `${String(w.count.lifts.planned)} lifts planned, trainingWeek ${String(counted)}`
    );
  const liftDays = scheduledDaysSinceStart(
    weekScheduleFor(profile),
    ["lift", "both"],
    weekKey,
    startKey
  );
  const asked =
    w.raceRest.length === 0
      ? liftDays
      : Math.min(liftDays, state.workouts.length - w.raceRest.length);
  if ((counted ?? 0) !== Math.max(0, asked))
    fail(
      `${String(counted)} lifts planned, race week asks ${String(asked)} (${String(w.raceRest.length)} rested)`
    );
  return out;
}

function season(
  persona: LiftPersona,
  weeks: number,
  seed: number,
  tally: Tally
): string[] {
  const failures: string[] = [];
  simulateLiftSeason(persona, {
    weeks,
    seed,
    observeDay: (day) => {
      tally.days++;
      failures.push(...check(day, tally));
    },
  });
  tally.seasons++;
  tally.weeks += weeks;
  return failures.map((f) => `${persona.name} seed ${String(seed)} ${f}`);
}

const ALL: readonly { persona: LiftPersona; weeks: number; seeds: number[] }[] =
  [
    ...LIFT_PERSONAS.map((persona) => ({ persona, weeks: 26, seeds: [1] })),
    ...ACTION_PERSONAS.map((p) => ({ ...p, seeds: [1] })),
    ...RUN_PERSONAS.map((p) => ({ ...p, seeds: [1] })),
    ...ANY_DAY.map((p) => ({ ...p, seeds: [1, 2, 3] })),
  ];

describe("the week laid out, through whole seasons", () => {
  afterAll(() => {
    console.info(`[layOutWeek season] ${JSON.stringify(total)}`);
    // Q56 compared every way Home names a next lift, not only its card.
    expect(total.homeNext).toBeGreaterThan(0);
    expect(total.homeNextLater).toBeGreaterThan(0);
    expect(total.homeNextNextWeek).toBeGreaterThan(0);
  });

  for (const { persona, weeks, seeds } of ALL)
    it(
      `${persona.name}: never lost, never twice, never missed; Home and Train name one next lift (Q56)`,
      () => {
        const tally = newTally();
        const failures = seeds.flatMap((seed) =>
          season(persona, weeks, seed, tally)
        );
        for (const key of Object.keys(total) as (keyof Tally)[])
          total[key] += tally[key];
        expect(failures.slice(0, 10)).toEqual([]);
        // Laid out on most days, not a season that never opened the app.
        expect(tally.days).toBeGreaterThan(weeks * seeds.length * 7);
        if (persona.answers.trainingActivity !== "running")
          expect(tally.lifts).toBeGreaterThan(0);
        if (persona.running?.freeRuns === undefined && persona.running)
          expect(tally.runs).toBeGreaterThan(0);
        // What only these people do, seen.
        if (persona.actions?.liftsOnOtherDays !== undefined)
          expect(tally.moved).toBeGreaterThan(0);
        if (persona.actions?.outsidePlan !== undefined)
          expect(tally.outsidePlan).toBeGreaterThan(0);
        if (persona.actions?.skipsLifts !== undefined)
          expect(tally.skipped + tally.raceRest).toBeGreaterThan(0);
      },
      TIMEOUT
    );
});
