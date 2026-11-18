/**
 * The week laid out (TrainWk1, step 1 of the Train grill's eight): each of
 * a person's sessions on a day, both sports, in one answer for every
 * surface that draws a week. The grill is `docs/train-week-2026-11/grill.md`.
 * The Train week prototype (`prototypes/train-week/index.html` on its own
 * branch, never merged) drew every screen from a `layOutWeek` of its own;
 * this is that function on the plan and the sessions as the app stores
 * them, and keeps its answers, including its own choices where the grill
 * left a rule open. Home's week strip, day card and "tomorrow" line read it
 * in step 2, which ends the two rules (the cursor and the slot) that could
 * name two different next lifts.
 *
 * @unwired: TrainWk1 step 1 adds it alone; Home reads it in step 2 (the grill's Q52).
 *
 * Nothing is stored for it (Q4, Q42). It is worked out each time from what
 * is saved: the lift order and its done and skipped marks, the dated runs,
 * the usual weekly layout on the profile, and the saved sessions.
 *
 *   lifts   The order is the truth: lifts are split-ordered (ADR-0002),
 *           which TrainWk1 call 1 keeps while drawing them on days. A lift
 *           done sits on the day its saved session belongs to, and one
 *           under way holds today. The lifts still to do are laid, in the
 *           order the next-up cursor offers them, on the week's free lift
 *           days from today on. A free lift day is one the usual layout
 *           lifts on ("lift" or "both"), from the day the account began,
 *           not one of a race's rest days (`isRaceRestDay`), and holding no
 *           lift of the plan done or under way. So a lift whose day passes
 *           moves to the next lift day by itself, and is never called
 *           missed. Lifts left when the free lift days run out are still to
 *           do (Q6): a rest day is not spent for the person, and the
 *           rollover opens next week with them. A skipped lift has no day
 *           (Q20).
 *   runs    keep their dates (Q5). Each day's planned run is the one the
 *           plan holds on it (`resolveTrainingDayForDate`, one a day, as
 *           every surface and the count read it): done when the claim map
 *           says a saved run filled it or it was marked done, and missed
 *           once its day has passed without either. A saved run that fills
 *           no planned run of the week sits on the day it was run (Q23).
 *   a day   with a lift and a run holds both, in Home's order (Q19): the
 *           run first when running is the person's aim. The plan's
 *           sessions come before the ones outside it.
 *
 * The prototype's own choices this keeps, where the grill left the rule
 * open (Tropos heuristics, each the prototype's numbered choice):
 *
 *   - (3) One lift per lift day: a lift day with a lift of the plan done on
 *     it takes no other. A lift done on a rest day stays there and takes
 *     no lift day, so the lifts after it move up.
 *   - (4) "Moved from" is said of a lift laid on another day than the week
 *     first gave it, earlier as well as later. The day the week first gave
 *     a lift (`plannedOn`) is the Nth lift day from the start for the Nth
 *     lift: the week laid out with nothing done.
 *   - (5) A past lift day whose lift went elsewhere says where it went
 *     (`slidOut`), so a folded day is never a blank.
 *   - (8, 10) With nothing to do today, the first planned session after it
 *     is named (`nextSession`); a planned row carries no word of its own.
 *   - (9) A session outside the plan (an empty workout, a routine, a free
 *     run) sits on its day, takes no lift day and comes after the plan's.
 *   - Race week (Q22): the lifts the app rests read "Rest before your
 *     race", in their own group, and a lift day left empty that week reads
 *     the same. The plan keeps no record of who skipped a lift, so every
 *     skip in race week, or on one of the race's rest days, reads so.
 *   - "Start next week" is offered once every lift of the week is done,
 *     never in race week (`liftsDone`).
 *   - The day's clash note (Q19): a hard run that is not a race and is not
 *     done or skipped, beside a lift that loads the legs and is not done.
 *
 * What this adds to the prototype, which modelled one week and its own
 * sessions:
 *
 *   - The plan's lifts belong to the week holding `today`: the cursor, the
 *     marks and "to do" are about now. Any other week shows the sessions
 *     saved in it and the runs the plan holds on its dates. A plan made for
 *     another week (after Start next week, or before the rollover has run)
 *     is laid as it stands, as Home reads it, with no day it was first
 *     given (`plannedOn` null).
 *   - A lift the plan marks done whose saved session is on no day of the
 *     week is done all the same (`doneOffWeek`): done before the week began,
 *     after Start next week, or saved where the list given cannot see it.
 *   - No lift is laid on a race's rest days in any week: a race early in a
 *     week rests the last days of the week before it too (`raceRestSkips`).
 *   - A run filled a day late keeps its date and says when it was run
 *     (`doneOn`), as the claim map allows; a race the app found no run for
 *     is "not-recorded".
 *
 * The owner's two calls on what the prototype left open (TrainWk1's
 * STATUS line of the 15th):
 *
 *   - The full plan from day one: a new account begun mid-week has every
 *     lift of its first week laid from today, and the lifts the days left
 *     cannot hold wait in order in Still to do and move on as any lift
 *     does. No lighter first week, and no start held back to Monday.
 *   - Race week counts only what it asks for: a lift the app rests before
 *     a race (the `raceRest` group) is not counted as planned
 *     (`countAsked`).
 *
 * The counts are `trainingWeek`'s (`count`), not this module's: every
 * weekly count comes from one module (App1 Q14), and the grill keeps them
 * as they are (Q43). The prototype counted the same way. One change is
 * the owner's: race week's planned lifts leave out the lifts the app
 * rests. `trainingWeek` and its server copy `leaguePlanned.js` count them
 * still, until step 2 moves them onto it. The sessions drawn agree with
 * the counts except where the plan knows more than the saved list, each
 * pinned in `layOutWeek.test.ts`:
 *
 *   - a lift in `doneOffWeek` is drawn done and counted in the week its
 *     session was saved in, not this one;
 *   - a planned run marked done by hand, on a day whose run that counts
 *     filled another planned run a day late, is drawn done twice over two
 *     planned runs and counted once (the count counts a mark by hand only
 *     on a day with no run that counts).
 *
 * Where it differs from Home's card today (`todaySession.ts`), which step 2
 * moves onto this: Home's "tomorrow" line names a lift on a race's rest day
 * and, with every lift done, the weekday's own lift, and calls a run day of
 * the usual layout with no run written a run day; the layout lays no lift
 * on a rest day or once the week's lifts are done, and plans only the runs
 * the plan dates, as the count does.
 */
import type { UserProfile } from "@/lib/auth";
import {
  HARD_RUN_TYPES,
  type ProgramState,
  type ScheduledRunDay,
  type WorkoutDay,
} from "@/features/program/programTypes";
import { nextUpIndex } from "@/features/program/nextUpCursor";
import { isLowerBodyDay } from "@/features/program/easierToday";
import { isRaceRestDay } from "@/features/program/raceRest";
import { runModeWithPlan } from "@/features/program/programMaintenance";
import { localWeekKey, parseLocalDate } from "./dateHelpers";
import type { ClaimState } from "./scheduledRunCompletion";
import { beforeStart, startDayKey } from "./startDay";
import { resolveTrainingDayForDate, weekScheduleFor } from "./trainingResolver";
import { trainingKind, type TrainingKind } from "./trainingKind";
import {
  trainingWeek,
  weekDays,
  type TrainingWeek,
  type WeekRun,
} from "./trainingWeek";
import { isVolumeEligible } from "./runStatsEligibility";
import { RUN_TEMPLATES } from "./workoutTemplates";

/** A session under way on this phone (`sessionsInFlight.ts`). */
export type SessionUnderWay =
  /** A lift of the plan by its index, or one outside it (null): a
   *  routine or an empty workout. */
  | { sport: "lift"; index: number | null }
  /** A planned run by its id, or a free run (null). */
  | { sport: "run"; runDayId: string | null };

export interface LayOutWeekInput {
  /** The week's Monday, "yyyy-MM-dd". */
  weekKey: string;
  /** The day it is read on, "yyyy-MM-dd". Every rule here reads this one
   *  day, never the clock. */
  today: string;
  profile: UserProfile | null;
  programState: ProgramState | null;
  /** The saved lift sessions: each one's id and the day it belongs to. */
  workouts: readonly { id: string; date: string }[];
  /** The saved runs, each with its id and the day it belongs to. */
  runs: readonly (WeekRun & { id: string })[];
  /** Which planned runs are done (`useClaimMapForProgram`, `claimMapFor`),
   *  from the same runs. */
  claimMap: Map<string, ClaimState>;
  /** The sessions under way today. Absent reads as none. */
  inProgress?: readonly SessionUnderWay[];
}

/** Where a session is: on a day, or in one of the week's groups. */
export type LayoutGroup =
  | "day"
  | "still-to-do"
  | "skipped"
  | "race-rest"
  | "done-off-week"
  | "before-start";

export interface LayoutLift {
  sport: "lift";
  /** A session of the plan, or one outside it. */
  plan: boolean;
  /** Its place in the plan's `workouts`, for `?day=N`; null outside the
   *  plan, and for a lift of a week other than today's. */
  index: number | null;
  workout: WorkoutDay | null;
  group: LayoutGroup;
  /** The day it sits on, for one in the "day" group. */
  date: string | null;
  /** "today" and "planned" are a lift to do, laid on today or a day after
   *  it. Never "missed". */
  state:
    | "done"
    | "in-progress"
    | "today"
    | "planned"
    | "still-to-do"
    | "skipped"
    | "race-rest";
  /** The saved session, for one done and saved. */
  savedId: string | null;
  /** The day the week first gave it: the week laid out with nothing done.
   *  Null outside the plan, for a plan made for another week, for a lift
   *  the week's lift days could not hold and for one the app rests. */
  plannedOn: string | null;
  /** `plannedOn`, for a lift to do laid on another day: "Moved from Mon". */
  movedFrom: string | null;
  /** The lift to do next (`next`). */
  isNext: boolean;
}

export interface LayoutRun {
  sport: "run";
  /** A run of the plan, or one outside it. */
  plan: boolean;
  /** The plan's run, or null outside it. */
  runDay: ScheduledRunDay | null;
  /** "day", or "before-start" for a planned run dated before the account
   *  began: kept, not drawn and not counted (Q24). */
  group: "day" | "before-start";
  date: string;
  /** "not-recorded" is a race the app found no run for (`race_no_show`). */
  state:
    | "done"
    | "in-progress"
    | "today"
    | "planned"
    | "missed"
    | "skipped"
    | "not-recorded"
    | "before-start";
  /** The saved run it is, or the one that filled the plan's; null for a
   *  planned run not done or marked done by hand. */
  savedRunId: string | null;
  /** The day the saved run that filled it was run, when not its own (a
   *  day late, as the claim map allows). */
  doneOn: string | null;
  /** The day the person moved it from (`movedFromDate`). */
  movedFrom: string | null;
  /** False for a saved run that counts in no total (saved anyway): it is
   *  shown, as Train's plan page shows it, and not counted. */
  counts: boolean;
}

export type LayoutSession = LayoutLift | LayoutRun;

/** Where a past lift day's lift went: another day, or a group. */
export interface SlidOut {
  lift: LayoutLift;
  to: string;
}

export interface LayoutDay {
  date: string;
  isToday: boolean;
  isPast: boolean;
  /** Before the account began: blank and uncounted (Q24). */
  beforeStart: boolean;
  /** The usual layout lifts on it ("lift" or "both"). */
  liftDay: boolean;
  /** One of a race's rest days, which take no lift. */
  raceRest: boolean;
  /** The plan's sessions, then the ones outside it; each in Home's order
   *  of the sports (`runFirst`). */
  sessions: LayoutSession[];
  /** A past lift day's lifts that went elsewhere (the prototype's 5): to
   *  a day ("yyyy-MM-dd"), or to "still-to-do" or "skipped". */
  slidOut: SlidOut[];
  /** What a day with nothing on it says, from the account's start:
   *  "race" (rest before the race), "moved" (its lift went elsewhere) or
   *  "rest". Null for a day with a session, or before the start. */
  rest: "race" | "moved" | "rest" | null;
  /** The strip's two lanes: what the day's lifts and runs come to. */
  lanes: {
    lift: "done" | "active" | "planned" | "none";
    run: "done" | "active" | "missed" | "planned" | "none";
  };
  /** A hard run beside a lift that loads the legs, neither done. */
  clash: boolean;
}

export interface WeekLayout {
  weekKey: string;
  /** Monday to Sunday. */
  days: LayoutDay[];
  /** Every session of the week, once each, wherever it sits. */
  entries: LayoutSession[];
  /** Lifts to do that no free lift day this week holds, in order (Q6). */
  stillToDo: LayoutLift[];
  /** Lifts the person skipped this week, in the plan's order (Q20). */
  skipped: LayoutLift[];
  /** Lifts the app rests before a race (Q22), in the plan's order. */
  raceRest: LayoutLift[];
  /** Lifts the plan marks done whose saved session is on no day of this
   *  week. */
  doneOffWeek: LayoutLift[];
  /** The free lift days the lifts to do were laid on, from today. */
  freeLiftDays: string[];
  /** The lift under way, else the lift to do next; null when none is
   *  left. */
  next: LayoutLift | null;
  /** With nothing to do or under way today, the first planned session on
   *  a day after it this week; else null. */
  nextSession: LayoutSession | null;
  /** Every lift of the week done, outside race week: Start next week
   *  (Q21). */
  liftsDone: boolean;
  /** On a day with both, the run leads, as on Home. */
  runFirst: boolean;
  /** Runs freely: the plan dates no run, so a standing card starts one
   *  (Q29), as Home's rest day offers one. */
  freeRunning: boolean;
  /** What the plan trains (`trainingKind`). */
  kind: TrainingKind;
  /** The week's counts, `trainingWeek`'s, with the lifts the app rests
   *  before a race left out of the planned lifts (`countAsked`). */
  count: TrainingWeek;
}

export function layOutWeek(input: LayOutWeekInput): WeekLayout {
  const { weekKey, today, profile, programState, workouts, runs, claimMap } =
    input;
  const dates = weekDays(weekKey);
  const currentWeekKey = localWeekKey(parseLocalDate(today));
  const thisWeek = weekKey === currentWeekKey;
  const startKey = startDayKey(profile?.createdAt);
  const runPlan = programState?.runPlan;
  const raceWeek = thisWeek && programState?.raceWeek === "race";
  const liftWeekday = new Set(
    weekScheduleFor(profile)
      .filter((d) => d.type === "lift" || d.type === "both")
      .map((d) => d.day)
  );
  const isLiftDay = (date: string) =>
    liftWeekday.has(parseLocalDate(date).getDay());
  const inWeek = (date: string) => date >= dates[0] && date <= dates[6];
  const underWay = thisWeek ? (input.inProgress ?? []) : [];
  const liftUnderWay = underWay.find((s) => s.sport === "lift");
  const runUnderWay = underWay.find((s) => s.sport === "run");

  const entries: LayoutSession[] = [];
  const stillToDo: LayoutLift[] = [];
  const skipped: LayoutLift[] = [];
  const raceRest: LayoutLift[] = [];
  const doneOffWeek: LayoutLift[] = [];
  const add = <S extends LayoutSession>(session: S): S => {
    entries.push(session);
    return session;
  };

  /* ── The plan's lifts ──────────────────────────────────────────── */
  const plan = programState?.workouts ?? [];
  const holdsPlan = thisWeek && plan.length > 0;
  const linked = new Set<string>();
  let freeLiftDays: string[] = [];

  if (holdsPlan) {
    const savedDay = new Map(workouts.map((w) => [w.id, w.date]));
    // The day the week first gave each lift, in the plan's own week only:
    // the Nth lift day from the start for the Nth lift. A week begun
    // mid-week can have fewer lift days left than lifts: the lifts over
    // have none, and wait in Still to do (the owner's full plan from day
    // one).
    const planWeek = programState?.liftWeekKey ?? currentWeekKey;
    const firstDays =
      planWeek === weekKey
        ? dates.filter((d) => isLiftDay(d) && !beforeStart(d, startKey))
        : [];
    const restBeforeRace = raceWeek || isRaceRestDay(runPlan, today);
    const lift = (
      index: number,
      group: LayoutGroup,
      date: string | null,
      state: LayoutLift["state"],
      extra: Partial<LayoutLift> = {}
    ): LayoutLift => ({
      sport: "lift",
      plan: true,
      index,
      workout: plan[index],
      group,
      date,
      state,
      savedId: null,
      plannedOn: firstDays[index] ?? null,
      movedFrom: null,
      isNext: false,
      ...extra,
    });

    const taken = new Set<string>();
    plan.forEach((day, index) => {
      if (!day.completed) return;
      const id = day.completedWorkoutId ?? null;
      const date = id ? savedDay.get(id) : undefined;
      if (id && date && inWeek(date)) {
        linked.add(id);
        taken.add(date);
        add(lift(index, "day", date, "done", { savedId: id }));
      } else
        doneOffWeek.push(
          add(lift(index, "done-off-week", null, "done", { savedId: id }))
        );
    });
    // A lift under way holds today until it is finished.
    const underWayIndex =
      liftUnderWay?.sport === "lift" &&
      liftUnderWay.index !== null &&
      plan[liftUnderWay.index] &&
      !plan[liftUnderWay.index].completed
        ? liftUnderWay.index
        : null;
    if (underWayIndex !== null) {
      taken.add(today);
      add(lift(underWayIndex, "day", today, "in-progress"));
    }
    plan.forEach((day, index) => {
      if (day.completed || !day.skipped || index === underWayIndex) return;
      if (restBeforeRace)
        raceRest.push(
          add(lift(index, "race-rest", null, "race-rest", { plannedOn: null }))
        );
      else skipped.push(add(lift(index, "skipped", null, "skipped")));
    });

    freeLiftDays = dates.filter(
      (d) =>
        d >= today &&
        isLiftDay(d) &&
        !beforeStart(d, startKey) &&
        !isRaceRestDay(runPlan, d) &&
        !taken.has(d)
    );
    cursorOrder(programState)
      .filter((index) => index !== underWayIndex)
      .forEach((index, k) => {
        const date = freeLiftDays[k];
        if (!date) {
          stillToDo.push(add(lift(index, "still-to-do", null, "still-to-do")));
          return;
        }
        const laid = lift(
          index,
          "day",
          date,
          date === today ? "today" : "planned"
        );
        if (laid.plannedOn && laid.plannedOn !== date)
          laid.movedFrom = laid.plannedOn;
        add(laid);
      });
  }

  // Lift sessions the plan's marks don't hold: outside the plan, or of a
  // week before the plan's.
  for (const w of workouts)
    if (inWeek(w.date) && !linked.has(w.id))
      add(outsideLift(w.date, "done", w.id));
  if (liftUnderWay?.sport === "lift" && liftUnderWay.index === null)
    add(outsideLift(today, "in-progress", null));

  /* ── Runs ──────────────────────────────────────────────────────── */
  const filledBy = new Set<string>();
  const runDayOf = new Map(runs.map((r) => [r.id, r.day]));
  for (const date of dates) {
    const resolved = resolveTrainingDayForDate({
      dateKey: date,
      profile,
      programState,
      currentWeekKey,
      claimMap,
      todayKey: today,
    }).run;
    const rd = resolved.runDay;
    if (!rd) continue;
    const before = beforeStart(date, startKey);
    const savedRunId =
      (rd.id ? claimMap.get(rd.id)?.claimedSavedRunId : undefined) ?? null;
    if (savedRunId && !before) filledBy.add(savedRunId);
    const done = resolved.isCompleted && !before;
    const ranOn = savedRunId ? runDayOf.get(savedRunId) : undefined;
    const isUnderWay =
      runUnderWay?.sport === "run" &&
      runUnderWay.runDayId !== null &&
      runUnderWay.runDayId === rd.id;
    add({
      sport: "run",
      plan: true,
      runDay: rd,
      group: before ? "before-start" : "day",
      date,
      state: before
        ? "before-start"
        : isUnderWay
          ? "in-progress"
          : done
            ? "done"
            : resolved.status === "skipped"
              ? "skipped"
              : resolved.status === "race_no_show"
                ? "not-recorded"
                : date < today
                  ? "missed"
                  : date === today
                    ? "today"
                    : "planned",
      savedRunId: done ? savedRunId : null,
      doneOn: done && ranOn && ranOn !== date ? ranOn : null,
      movedFrom: rd.movedFromDate ?? null,
      counts: true,
    });
  }
  for (const run of runs)
    if (inWeek(run.day) && !filledBy.has(run.id))
      add(outsideRun(run.day, "done", run.id, isVolumeEligible(run)));
  if (runUnderWay?.sport === "run" && runUnderWay.runDayId === null)
    add(outsideRun(today, "in-progress", null, true));

  /* ── Next ──────────────────────────────────────────────────────── */
  const isPlanLift = (s: LayoutSession): s is LayoutLift =>
    s.sport === "lift" && s.plan;
  const next =
    entries.find(
      (s): s is LayoutLift =>
        isPlanLift(s) &&
        (s.state === "in-progress" ||
          s.state === "today" ||
          s.state === "planned")
    ) ??
    stillToDo[0] ??
    null;
  if (next) next.isNext = true;

  /* ── Days ──────────────────────────────────────────────────────── */
  const runFirst = profile?.primaryGoal === "running";
  const rank = (s: LayoutSession) =>
    (s.plan ? 0 : 2) + ((s.sport === "run") === runFirst ? 0 : 1);
  const planLifts = entries.filter(isPlanLift);
  const days = dates.map((date): LayoutDay => {
    const sessions = entries
      .filter((s) => s.group === "day" && s.date === date)
      .sort((a, b) => rank(a) - rank(b));
    const lifts = sessions.filter((s): s is LayoutLift => s.sport === "lift");
    const dayRuns = sessions.filter((s): s is LayoutRun => s.sport === "run");
    const has = (list: readonly LayoutSession[], state: string) =>
      list.some((s) => s.state === state);
    const slidOut: SlidOut[] =
      date < today
        ? planLifts.flatMap((l) =>
            l.plannedOn === date &&
            l.state !== "done" &&
            l.date !== date &&
            (l.group === "day" ||
              l.group === "still-to-do" ||
              l.group === "skipped")
              ? [{ lift: l, to: l.group === "day" ? l.date! : l.group }]
              : []
          )
        : [];
    const priorToAccount = beforeStart(date, startKey);
    const liftDay = isLiftDay(date);
    const raceRestDay = isRaceRestDay(runPlan, date);
    return {
      date,
      isToday: date === today,
      isPast: date < today,
      beforeStart: priorToAccount,
      liftDay,
      raceRest: raceRestDay,
      sessions,
      slidOut,
      rest:
        sessions.length > 0 || priorToAccount
          ? null
          : liftDay && slidOut.length === 0 && (raceWeek || raceRestDay)
            ? "race"
            : slidOut.length > 0
              ? "moved"
              : "rest",
      lanes: {
        lift: has(lifts, "done")
          ? "done"
          : has(lifts, "in-progress")
            ? "active"
            : lifts.length > 0
              ? "planned"
              : "none",
        run: has(dayRuns, "done")
          ? "done"
          : has(dayRuns, "in-progress")
            ? "active"
            : has(dayRuns, "missed")
              ? "missed"
              : has(dayRuns, "today") || has(dayRuns, "planned")
                ? "planned"
                : "none",
      },
      clash:
        dayRuns.some(
          (r) =>
            isHardRun(r.runDay) && r.state !== "done" && r.state !== "skipped"
        ) &&
        lifts.some(
          (l) => l.state !== "done" && !!l.workout && isLowerBodyDay(l.workout)
        ),
    };
  });

  // The prototype's 8 and 10: with nothing to do or under way today, the
  // first planned session after it names the next one.
  const todayIndex = dates.indexOf(today);
  const todayBusy =
    todayIndex >= 0 &&
    days[todayIndex].sessions.some(
      (s) => s.state === "today" || s.state === "in-progress"
    );
  const nextSession =
    todayIndex < 0 || todayBusy
      ? null
      : (days
          .slice(todayIndex + 1)
          .flatMap((d) => d.sessions)
          .find((s) => s.state === "planned") ?? null);

  const kind = trainingKind(profile, programState);
  return {
    weekKey,
    days,
    entries,
    stillToDo,
    skipped,
    raceRest,
    doneOffWeek,
    freeLiftDays,
    next,
    nextSession,
    liftsDone: holdsPlan && !raceWeek && plan.every((day) => day.completed),
    runFirst,
    // Home's rest day offers a run on the same test (`todaySession.ts`).
    freeRunning:
      profile?.runMode === "freeform" &&
      runModeWithPlan(profile, programState) === "freeform" &&
      kind.runs,
    kind,
    count: countAsked(
      trainingWeek({
        weekKey,
        profile,
        programState,
        workouts,
        runs,
        now: parseLocalDate(today),
      }),
      plan.length,
      raceRest.length
    ),
  };
}

/**
 * The week's count with race week counting only what it asks for (the
 * owner's call): the lifts the app rests before a race are not planned.
 * Race week keeps one session of the plan's (`raceWeekSession`), so its
 * planned lifts are the plan's lifts the app did not rest, never more than
 * the week's lift days; none reads as nothing planned, as the count's own
 * none does.
 */
function countAsked(
  count: TrainingWeek,
  lifts: number,
  rested: number
): TrainingWeek {
  if (rested === 0 || count.lifts.planned === null) return count;
  const asked = Math.min(count.lifts.planned, lifts - rested);
  return {
    ...count,
    lifts: { ...count.lifts, planned: asked > 0 ? asked : null },
  };
}

/** A lift outside the plan, on its day. */
function outsideLift(
  date: string,
  state: "done" | "in-progress",
  savedId: string | null
): LayoutLift {
  return {
    sport: "lift",
    plan: false,
    index: null,
    workout: null,
    group: "day",
    date,
    state,
    savedId,
    plannedOn: null,
    movedFrom: null,
    isNext: false,
  };
}

/** A run outside the plan, on its day. */
function outsideRun(
  date: string,
  state: "done" | "in-progress",
  savedRunId: string | null,
  counts: boolean
): LayoutRun {
  return {
    sport: "run",
    plan: false,
    runDay: null,
    group: "day",
    date,
    state,
    savedRunId,
    doneOn: null,
    movedFrom: null,
    counts,
  };
}

/**
 * The lifts to do, in the order the next-up cursor offers them: asked
 * again with each one it names marked done, so a lift chosen with "Make
 * this next" leads and the order resumes after it, as the cursor does.
 */
function cursorOrder(programState: ProgramState | null): number[] {
  if (!programState?.workouts?.length) return [];
  const order: number[] = [];
  let workouts = programState.workouts;
  for (let guard = 0; guard < programState.workouts.length; guard++) {
    const index = nextUpIndex({
      workouts,
      nextWorkoutOverride: programState.nextWorkoutOverride,
    });
    if (index < 0) break;
    order.push(index);
    workouts = workouts.map((day, i) =>
      i === index ? { ...day, completed: true } : day
    );
  }
  return order;
}

/** A planned run of a hard kind other than a race: long, tempo or
 *  intervals, by the session it holds now (a swap included). A race day
 *  has no lift beside it. */
function isHardRun(runDay: ScheduledRunDay | null): boolean {
  if (!runDay) return false;
  const type =
    RUN_TEMPLATES.find(
      (t) => t.id === (runDay.userOverride || runDay.templateId)
    )?.type ?? runDay.type;
  return type !== "race" && HARD_RUN_TYPES.has(type);
}
