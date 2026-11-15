import type { ProgramState } from "@/features/program/programTypes";
import { isRaceRestDay } from "@/features/program/raceRest";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { beforeStart } from "@/lib/startDay";
import {
  dayTypeFor,
  resolveTrainingDayForDate,
  runsWrittenForWeek,
  weekScheduleFor,
} from "@/lib/trainingResolver";

/**
 * The plan's rest days, which keep the streak (App1 Q32, 13 November 2026:
 * "the streak stays as days, with covered rest days").
 *
 * A day the person's plan holds as rest neither breaks the streak nor asks
 * for a session: it counts as a day of it, as a logged day does. A
 * three-day lifter who logs only their lifts keeps a streak through the
 * four days between, where before every one of those days needed a meal or
 * the week's one forgiven day.
 *
 * A rest day is a day the plan holds no session, read the way Home reads
 * today (`todaySession`): the person's week schedule for the lifts
 * (`weekScheduleFor`, ADR-0002's split order), and the plan's run days for
 * the runs, pinned to their dates, so a run moved to another day, or a
 * taper week that drops one, leaves its old day at rest. The two days
 * before a race and race day hold no lifting (`isRaceRestDay`), so a lift
 * on one of them is the plan's rest too. A past week is read as the app
 * reads it everywhere (`trainingWeek.ts`): its runs from the pattern, since
 * the plan keeps only the current week's run days.
 *
 * Not a rest day:
 * - a planned session not done, skipped or not: a day off the plan is
 *   the Streak1 grace's (one in any seven), as it always was;
 * - any day for a person with no plan, one whose week holds no session:
 *   with nothing planned there is nothing to rest from, and every day
 *   would be covered. Their streak is Streak1's;
 * - a day before the account began.
 *
 * Pure. The streak hook builds the set over the days it reads; the server
 * never reads a plan for the streak, it reads `keptThrough`, which the app
 * stores from this (`useStreaks`).
 */

/** What the rest days are read from: the profile's week schedule, the day
 *  the account began and the programme's run days and race. */
export interface StreakPlan {
  /** The profile's schedule fields (`weekScheduleFor`); none before the
   *  profile has loaded, which plans nothing. */
  profile: Parameters<typeof weekScheduleFor>[0];
  /** The day the account began (`startDayKey`), null while not known. */
  startKey: string | null;
  programState: ProgramState | null | undefined;
}

/** Whether the plan holds any session at all. */
export function planHoldsSessions(plan: StreakPlan): boolean {
  if (!plan.profile) return false;
  if ((plan.programState?.runDays?.length ?? 0) > 0) return true;
  return weekScheduleFor(plan.profile).some((d) => d.type !== "rest");
}

/** Whether the plan holds `dateKey` as a rest day, read on `todayKey`. */
export function isPlannedRestDay(
  dateKey: string,
  plan: StreakPlan,
  todayKey: string
): boolean {
  const { profile, programState } = plan;
  if (!profile || !planHoldsSessions(plan)) return false;
  if (beforeStart(dateKey, plan.startKey)) return false;
  const currentWeekKey = localWeekKey(parseLocalDate(todayKey));
  const resolved = resolveTrainingDayForDate({
    dateKey,
    profile,
    programState: programState ?? null,
    currentWeekKey,
    todayKey,
  });
  const type = dayTypeFor(
    resolved,
    runsWrittenForWeek(
      programState?.runDays,
      localWeekKey(parseLocalDate(dateKey)),
      currentWeekKey
    )
  );
  if (type === "rest") return true;
  // A race's rest days hold no lifting, so a lift there is the plan's rest.
  return type === "lift" && isRaceRestDay(programState?.runPlan, dateKey);
}

/** The plan's rest days from `fromKey` to `toKey`, both included. */
export function plannedRestDays(
  plan: StreakPlan,
  fromKey: string,
  toKey: string,
  todayKey: string
): Set<string> {
  const out = new Set<string>();
  if (!planHoldsSessions(plan)) return out;
  for (
    let d = parseLocalDate(fromKey);
    localDateString(d) <= toKey;
    d = addLocalDays(d, 1)
  ) {
    const key = localDateString(d);
    if (isPlannedRestDay(key, plan, todayKey)) out.add(key);
  }
  return out;
}

/** The longest run of rest days a week can hold. A plan with seven holds
 *  no session, and is no plan. */
const MAX_REST_RUN = 6;

/**
 * The last day a streak that ends on `endKey` is kept through without
 * another log: `endKey`, then each rest day straight after it. Days ahead
 * of today are read from the plan as it stands, so this is a forecast,
 * kept for the readers that cannot read a plan: the server's evening
 * nudge and other people reading a public profile.
 */
export function keptThroughAfter(
  endKey: string,
  plan: StreakPlan,
  todayKey: string
): string {
  let through = endKey;
  for (let i = 0; i < MAX_REST_RUN; i++) {
    const next = localDateString(addLocalDays(parseLocalDate(through), 1));
    if (!isPlannedRestDay(next, plan, todayKey)) break;
    through = next;
  }
  return through;
}
