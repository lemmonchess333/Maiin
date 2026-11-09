import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import {
  dayTypeFor,
  resolveTrainingWindow,
  runsWrittenForWeek,
} from "@/lib/trainingResolver";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import { beforeStart } from "@/lib/startDay";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";

/**
 * What one day of Home's week strip shows (DS4: seven segments under the
 * hero). The segment carries the day's state on its own; there is no dot
 * row beneath it and no legend to learn. Its colour is the person's
 * training, the largest colour on Home (§14m).
 *
 *   lift-done / run-done  filled with the sport's colour
 *   both-done             split between the two
 *   planned               outlined in its sport's colour: still to do
 *   missed                a dashed outline: a planned day that has passed
 *   rest                  the bare track
 *   before                the bare track, for a day before the account
 *                         began: a plan made on Friday did not miss Monday
 *
 * `WeekStrip` draws these and the Home Screen widget's week reads the same
 * seven (`homeWidgetSnapshot.ts`), so the two cannot disagree about a day.
 */
export type WeekDayState =
  | "lift-done"
  | "run-done"
  | "both-done"
  | "planned"
  | "missed"
  | "rest"
  | "before";

export interface StripDay {
  key: string;
  sType: string;
  /** The planned lift slot's status. Lifts are split-ordered (ADR-0002),
   *  so a slot can be completed by a session on another day. */
  liftCompleted: boolean;
  liftSkipped: boolean;
  /** A lift session was logged ON this date. */
  liftLogged: boolean;
  /** A run was done on this date: the planned run's derived completion,
   *  or a logged run that claimed no planned day. */
  runDone: boolean;
  runSkipped: boolean;
}

export interface WeekStripDay extends StripDay {
  isToday: boolean;
  isPast: boolean;
  state: WeekDayState;
}

/**
 * The circle is a statement about the DATE. It fills for what was done
 * that day: a logged lift session (planned or not) and a completed or
 * extra run. A planned day with nothing done is planned while ahead and
 * missed once passed, unless its plan was settled some other way — the
 * lift slot completed by a session on another day, or either session
 * skipped — in which case the day is bare, like rest.
 */
export function weekDayState(
  day: StripDay,
  todayKey: string,
  startKey: string | null
): WeekDayState {
  const hasLift = day.sType === "lift" || day.sType === "both";
  const hasRun = day.sType === "run" || day.sType === "both";
  if (day.liftLogged && day.runDone) return "both-done";
  if (day.liftLogged) return "lift-done";
  if (day.runDone) return "run-done";
  if (beforeStart(day.key, startKey)) return "before";
  const liftOpen = hasLift && !day.liftSkipped && !day.liftCompleted;
  const runOpen = hasRun && !day.runSkipped;
  if (!liftOpen && !runOpen) return "rest";
  return day.key < todayKey ? "missed" : "planned";
}

/**
 * The seven days of the calendar week holding today, each with what the
 * strip draws for it.
 *
 * The CALENDAR week containing today, not a rolling window that starts at
 * today. Home labels this section "This week" while the strip once ran
 * today..today+6, so on a Wednesday it read Wed-Tue and spanned two weeks
 * under a heading claiming one. The days already gone were simply absent,
 * which also put DayPeekCard's nutrition row out of reach: every date the
 * card could be given was in the future, and a future day has no meals to
 * summarise.
 *
 * Starting on the week's FIRST day is forced by the data model, not a
 * style choice — and note the argument never names a weekday.
 * `resolveTrainingWindow` derives `currentWeekKey` from `startDate`, the
 * anchor gating the resolver's legacy run-day fallback, which its
 * docstring says must be today's. Starting on `localWeekKey(today)` keeps
 * that true for free: all seven days share that one key, so no day can
 * inherit another week's status. Any strip starting mid-week would
 * straddle two keys and break exactly the guard PR-0c installed. The strip
 * follows `WEEK_STARTS_ON`, so the Monday flip cost it nothing.
 */
export function weekStripDays(input: {
  /** Today, "yyyy-MM-dd": Home's day key (`useLocalDateKey`). */
  todayKey: string;
  profile: UserProfile | null;
  programState: ProgramState | null;
  /** Which planned runs are done (`useClaimMapForProgram`). */
  claimMap: Map<string, ClaimState>;
  /** Dates ("yyyy-MM-dd") with a logged lift session. */
  loggedLiftDates?: ReadonlySet<string>;
  /** Dates with a logged run that claimed no planned day. */
  extraRunDates?: ReadonlySet<string>;
  /** The day the account began (startDay.ts); earlier days plan nothing. */
  startKey?: string | null;
}): WeekStripDay[] {
  const { todayKey, profile, programState, claimMap } = input;
  const startKey = input.startKey ?? null;
  const weekStart = parseLocalDate(localWeekKey(parseLocalDate(todayKey)));
  const resolved = resolveTrainingWindow({
    startDate: weekStart,
    days: 7,
    profile,
    programState,
    claimMap,
    todayKey,
  });
  // One week, so one answer: are its runs written? A run then sits on
  // the date the plan holds it, whatever the weekday (`dayTypeFor`).
  const weekKey = localWeekKey(weekStart);
  const runsWritten = runsWrittenForWeek(
    programState?.runDays,
    weekKey,
    weekKey
  );
  return resolved.map((r) => {
    const day: StripDay = {
      key: r.dateKey,
      sType: dayTypeFor(r, runsWritten),
      liftCompleted: r.lift.status === "completed",
      liftSkipped: r.lift.status === "skipped",
      liftLogged: input.loggedLiftDates?.has(r.dateKey) ?? false,
      runDone:
        r.run.isCompleted || (input.extraRunDates?.has(r.dateKey) ?? false),
      runSkipped: r.run.status === "skipped",
    };
    return {
      ...day,
      isToday: r.dateKey === todayKey,
      isPast: r.dateKey < todayKey,
      state: weekDayState(day, todayKey, startKey),
    };
  });
}
