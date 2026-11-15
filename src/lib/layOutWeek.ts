/**
 * The week laid out (TrainWk1, step 1 of the Train grill's eight): each of
 * a person's sessions on a day, both sports, in one answer for every
 * surface that draws a week. The grill is `docs/train-week-2026-11/grill.md`;
 * Home's week strip, day card and "tomorrow" line read it in step 2, which
 * ends the two rules (the cursor and the slot) that could name two
 * different next lifts.
 *
 * Nothing is stored for it (Q4, Q42). It is worked out each time from what
 * is saved: the lift order and its done and skipped marks, the dated runs,
 * the usual weekly layout on the profile, and the saved sessions.
 *
 *   lifts   The order is the truth: lifts are split-ordered (ADR-0002),
 *           which TrainWk1 call 1 keeps while drawing them on days. A lift
 *           done sits on the day its saved session belongs to. The lifts
 *           still to do are laid, in the order the next-up cursor offers
 *           them, on the week's free lift days from today on. A free lift
 *           day is one the usual layout lifts on ("lift" or "both"), from
 *           the day the account began, not one of a race's rest days
 *           (`isRaceRestDay`), and holding no lift of the plan done on it.
 *           So a lift whose day passes moves to the next lift day by
 *           itself, and is never called missed. One laid later than the
 *           day the week first gave it says where it moved from ("Moved
 *           from Mon"). Lifts left when the free lift days run out are
 *           still to do (Q6): a rest day is not spent for the person, and
 *           the rollover opens next week with them. A skipped lift has no
 *           day (Q20).
 *   runs    keep their dates (Q5). Each day's planned run is the one the
 *           plan holds on it (`resolveTrainingDayForDate`, one a day, as
 *           every surface and the count read it): done when the claim map
 *           says a saved run filled it or it was marked done, and missed
 *           once its day has passed without either. A saved run that fills
 *           no planned run of the week sits on the day it was run (Q23).
 *   a day   with a lift and a run holds both, in Home's order (Q19): the
 *           run first when running is the person's aim.
 *
 * The plan's lifts belong to the week holding `today`: the cursor, the
 * marks and "to do" are about now. Any other week shows the sessions saved
 * in it and the runs the plan holds on its dates.
 *
 * Tropos heuristics, each chosen where the grill leaves the rule open:
 *
 *   - Lifts to do fill the free lift days in order from today, so one done
 *     early, on a rest day, brings the rest forward rather than holding
 *     each lift's own day. The grill's words ("laid, in order, on the
 *     usual lift days from today onward"), and it is what Home's card
 *     does: a lift day offers the cursor's next lift, whatever was done
 *     the day before.
 *   - A lift day is taken only by a lift of the plan done on it. A session
 *     outside the plan (an empty workout, a routine) sits on its day
 *     beside the plan's lift, as Home's card still offers that lift.
 *   - The day the week first gave a lift (`plannedOn`) is the Nth free
 *     lift day for the Nth lift, which is the week laid out with nothing
 *     done. "Moved from" is said only of a lift laid later than that day:
 *     a lift brought forward has not slipped.
 *   - No lift is laid on a race's rest days (the two before it and race
 *     day), where the app skips any lift left (`raceRestSkips`), and a
 *     skipped lift reads as rest before the race in race week or on a
 *     rest day (Q22). A lift the person skipped themselves in race week
 *     reads the same: the plan keeps no record of who skipped it.
 *   - The day's clash note (Q19) is a hard run (`HARD_RUN_TYPES`) and a
 *     lift that loads the legs (`isLowerBodyDay`), both still to do.
 *   - A lift the plan marks done whose saved session is not on a day of
 *     the week is done all the same (`doneOffWeek`): done before the week
 *     began, after Start next week, or saved where the list given cannot
 *     see it. It is never dropped and never offered again.
 *
 * The counts are `trainingWeek`'s (`count`), never this module's: every
 * weekly count comes from one module (App1 Q14). The sessions drawn agree
 * with them except where the plan knows more than the saved list, each
 * pinned in `layOutWeek.test.ts`:
 *
 *   - a lift in `doneOffWeek` is drawn done and counted in no week of this
 *     one (the count counts saved sessions in the week);
 *   - a planned run marked done by hand, on a day whose run that counts
 *     filled another planned run (a day late), is drawn done twice over
 *     two planned runs and counted once (the count counts a mark by hand
 *     only on a day with no run that counts).
 *
 * Where it differs from Home's card today (`todaySession.ts`), which step 2
 * moves onto this: Home's "tomorrow" line names a lift on a race's rest day
 * and, with every lift done, the weekday's own lift; the layout lays none
 * on a rest day and none once the week's lifts are done.
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
}

export interface LayoutLift {
  sport: "lift";
  /** Its place in the plan's `workouts`, for `?day=N`; null for a session
   *  the plan does not hold (an empty workout, a routine, or a lift of a
   *  week other than today's). */
  index: number | null;
  workout: WorkoutDay | null;
  state: "done" | "to-do" | "skipped";
  /** The saved session, for one done and saved. */
  savedId: string | null;
  /** The day the week first gave it: the week laid out with nothing done.
   *  Null outside today's week, for a plan made for another week (a
   *  rollover not reached yet, or Start next week), and for a lift the
   *  week's lift days could not hold. */
  plannedOn: string | null;
  /** `plannedOn`, when it now sits on a later day: "Moved from Mon". */
  movedFrom: string | null;
  /** The cursor's next (`nextUpIndex`): Train's "Up next", Home's lift. */
  isNext: boolean;
  /** Skipped by the app before a race: "Rest before your race". */
  restBeforeRace: boolean;
}

export interface LayoutRun {
  sport: "run";
  /** The plan's run, or null for a run outside the plan. */
  runDay: ScheduledRunDay | null;
  /** "not-recorded" is a race the app found no run for (`race_no_show`). */
  state: "done" | "to-do" | "missed" | "skipped" | "not-recorded";
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
  /** Its sessions, each sport's done before its to-do, the sports in
   *  Home's order (`runFirst`). */
  sessions: LayoutSession[];
  /** A hard run beside a lift that loads the legs, both still to do. */
  clash: boolean;
}

export interface WeekLayout {
  weekKey: string;
  /** Monday to Sunday. */
  days: LayoutDay[];
  /** Lifts to do that no free lift day this week holds, in order (Q6). */
  stillToDo: LayoutLift[];
  /** Lifts skipped this week, in the plan's order (Q20). */
  skipped: LayoutLift[];
  /** Lifts the plan marks done whose saved session is on no day of this
   *  week. */
  doneOffWeek: LayoutLift[];
  /** The lift to do next, wherever it sits; null when none is left. */
  next: LayoutLift | null;
  /** Every lift of the week done or skipped: Start next week (Q21). */
  liftsDone: boolean;
  /** On a day with both, the run leads, as on Home. */
  runFirst: boolean;
  /** Runs freely: the plan dates no run, so a standing card starts one
   *  (Q29), as Home's rest day offers one. */
  freeRunning: boolean;
  /** What the plan trains (`trainingKind`). */
  kind: TrainingKind;
  /** The week's counts, `trainingWeek`'s. */
  count: TrainingWeek;
}

/** A day's lift as laid, before the day's order is set. */
type Placed = { date: string; lift: LayoutLift };

export function layOutWeek(input: LayOutWeekInput): WeekLayout {
  const { weekKey, today, profile, programState, workouts, runs, claimMap } =
    input;
  const dates = weekDays(weekKey);
  const currentWeekKey = localWeekKey(parseLocalDate(today));
  const startKey = startDayKey(profile?.createdAt);
  const runPlan = programState?.runPlan;
  const schedule = weekScheduleFor(profile);
  const liftWeekday = new Set(
    schedule
      .filter((d) => d.type === "lift" || d.type === "both")
      .map((d) => d.day)
  );
  const isLiftDay = (date: string) =>
    liftWeekday.has(parseLocalDate(date).getDay());
  const inWeek = (date: string) => date >= dates[0] && date <= dates[6];

  /* ── Lifts ─────────────────────────────────────────────────────── */
  const placed: Placed[] = [];
  const stillToDo: LayoutLift[] = [];
  const skipped: LayoutLift[] = [];
  const doneOffWeek: LayoutLift[] = [];
  const plan = programState?.workouts ?? [];
  const holdsPlan = weekKey === currentWeekKey && plan.length > 0;
  const linked = new Set<string>();

  if (holdsPlan) {
    const savedDay = new Map(workouts.map((w) => [w.id, w.date]));
    // A day the plan lifts on with nothing done yet: "lift"/"both", from
    // the start, not a race's rest day.
    const plannable = (date: string) =>
      isLiftDay(date) &&
      !beforeStart(date, startKey) &&
      !isRaceRestDay(runPlan, date);
    // The day the week first gave each lift: its own week only.
    const planWeek = programState?.liftWeekKey ?? currentWeekKey;
    const firstDays = planWeek === weekKey ? dates.filter(plannable) : [];
    const restBeforeRace =
      programState?.raceWeek === "race" || isRaceRestDay(runPlan, today);
    const nextIndex = nextUpIndex(programState);
    const lift = (
      index: number,
      state: LayoutLift["state"],
      savedId: string | null
    ): LayoutLift => ({
      sport: "lift",
      index,
      workout: plan[index],
      state,
      savedId,
      plannedOn: firstDays[index] ?? null,
      movedFrom: null,
      isNext: index === nextIndex,
      restBeforeRace: state === "skipped" && restBeforeRace,
    });

    const taken = new Set<string>();
    plan.forEach((day, index) => {
      if (day.completed) {
        const id = day.completedWorkoutId;
        const date = id ? savedDay.get(id) : undefined;
        if (id && date && inWeek(date)) {
          linked.add(id);
          taken.add(date);
          placed.push({ date, lift: lift(index, "done", id) });
        } else doneOffWeek.push(lift(index, "done", id ?? null));
      } else if (day.skipped) skipped.push(lift(index, "skipped", null));
    });

    const free = dates.filter(
      (date) => date >= today && plannable(date) && !taken.has(date)
    );
    cursorOrder(programState).forEach((index, k) => {
      const laid = lift(index, "to-do", null);
      const date = free[k];
      if (!date) {
        stillToDo.push(laid);
        return;
      }
      if (laid.plannedOn && date > laid.plannedOn)
        laid.movedFrom = laid.plannedOn;
      placed.push({ date, lift: laid });
    });
  }

  // Lift sessions the plan's marks don't hold: outside the plan, or of a
  // week before the plan's.
  for (const w of workouts)
    if (inWeek(w.date) && !linked.has(w.id))
      placed.push({
        date: w.date,
        lift: {
          sport: "lift",
          index: null,
          workout: null,
          state: "done",
          savedId: w.id,
          plannedOn: null,
          movedFrom: null,
          isNext: false,
          restBeforeRace: false,
        },
      });

  /* ── Runs ──────────────────────────────────────────────────────── */
  const planned = new Map<string, LayoutRun>();
  const filledBy = new Set<string>();
  const runDay = new Map(runs.map((r) => [r.id, r.day]));
  for (const date of dates) {
    if (beforeStart(date, startKey)) continue;
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
    const savedRunId =
      (rd.id ? claimMap.get(rd.id)?.claimedSavedRunId : undefined) ?? null;
    if (savedRunId) filledBy.add(savedRunId);
    const ranOn = savedRunId ? runDay.get(savedRunId) : undefined;
    planned.set(date, {
      sport: "run",
      runDay: rd,
      state: resolved.isCompleted
        ? "done"
        : resolved.status === "skipped"
          ? "skipped"
          : resolved.status === "race_no_show"
            ? "not-recorded"
            : date < today
              ? "missed"
              : "to-do",
      savedRunId: resolved.isCompleted ? savedRunId : null,
      doneOn: resolved.isCompleted && ranOn && ranOn !== date ? ranOn : null,
      movedFrom: rd.movedFromDate ?? null,
      counts: true,
    });
  }

  /* ── Days ──────────────────────────────────────────────────────── */
  const runFirst = profile?.primaryGoal === "running";
  const days = dates.map((date): LayoutDay => {
    const lifts = placed
      .filter((p) => p.date === date)
      .map((p) => p.lift)
      .sort((a, b) => doneFirst(a.state) - doneFirst(b.state));
    const dayRuns: LayoutRun[] = [];
    const plannedRun = planned.get(date);
    if (plannedRun) dayRuns.push(plannedRun);
    for (const run of runs)
      if (run.day === date && !filledBy.has(run.id))
        dayRuns.push({
          sport: "run",
          runDay: null,
          state: "done",
          savedRunId: run.id,
          doneOn: null,
          movedFrom: null,
          counts: isVolumeEligible(run),
        });
    dayRuns.sort((a, b) => doneFirst(a.state) - doneFirst(b.state));
    return {
      date,
      isToday: date === today,
      isPast: date < today,
      beforeStart: beforeStart(date, startKey),
      liftDay: isLiftDay(date),
      raceRest: isRaceRestDay(runPlan, date),
      sessions: runFirst ? [...dayRuns, ...lifts] : [...lifts, ...dayRuns],
      clash:
        lifts.some(
          (l) => l.state === "to-do" && !!l.workout && isLowerBodyDay(l.workout)
        ) && dayRuns.some((r) => r.state === "to-do" && isHardRun(r.runDay)),
    };
  });

  const kind = trainingKind(profile, programState);
  const next =
    placed.find((p) => p.lift.isNext)?.lift ??
    stillToDo.find((l) => l.isNext) ??
    null;
  return {
    weekKey,
    days,
    stillToDo,
    skipped,
    doneOffWeek,
    next,
    liftsDone:
      holdsPlan && plan.every((day) => day.completed || day.skipped === true),
    runFirst,
    // Home's rest day offers a run on the same test (`todaySession.ts`).
    freeRunning:
      profile?.runMode === "freeform" &&
      runModeWithPlan(profile, programState) === "freeform" &&
      kind.runs,
    kind,
    count: trainingWeek({
      weekKey,
      profile,
      programState,
      workouts,
      runs,
      now: parseLocalDate(today),
    }),
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

/** Done sessions sort before the day's to-do. */
function doneFirst(state: LayoutSession["state"]): number {
  return state === "done" ? 0 : 1;
}

/** A planned run of a hard kind: long, tempo, intervals or a race, by the
 *  session it holds now (a swap included). */
function isHardRun(runDay: ScheduledRunDay | null): boolean {
  if (!runDay) return false;
  const template = RUN_TEMPLATES.find(
    (t) => t.id === (runDay.userOverride || runDay.templateId)
  );
  return HARD_RUN_TYPES.has(template?.type ?? runDay.type);
}
