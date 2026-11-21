import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import { layOutWeek, type LayoutDay, type WeekLayout } from "@/lib/layOutWeek";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";

/**
 * The week Home's strip draws (`WeekStrip`, `weekStripDays`), laid out
 * from a plan and the days sessions were saved on, as Home lays it out
 * (`layOutWeek`). For a test of what the strip shows for a plan, written
 * the way the strip's tests set a week up: a lift session saved on each of
 * `loggedLiftDates`, a run that filled no planned run on each of
 * `extraRunDates`, and the account begun on `startKey`.
 */
export function stripWeek(input: {
  todayKey: string;
  profile: UserProfile | null;
  programState: ProgramState | null;
  claimMap: Map<string, ClaimState>;
  loggedLiftDates?: ReadonlySet<string>;
  extraRunDates?: ReadonlySet<string>;
  startKey?: string | null;
  /** The plan's lifts' saved sessions, by id, beside `loggedLiftDates`. */
  workouts?: readonly { id: string; date: string }[];
}): WeekLayout {
  const { todayKey, programState, claimMap } = input;
  const began = input.startKey
    ? parseLocalDate(input.startKey).getTime() + 9 * 3_600_000
    : null;
  const profile =
    began === null
      ? input.profile
      : ({
          ...(input.profile ?? {}),
          createdAt: { toMillis: () => began },
        } as UserProfile);
  return layOutWeek({
    weekKey: localWeekKey(parseLocalDate(todayKey)),
    today: todayKey,
    profile,
    programState,
    claimMap,
    workouts: [
      ...(input.workouts ?? []),
      ...[...(input.loggedLiftDates ?? [])].map((date) => ({
        id: `logged-${date}`,
        date,
      })),
    ],
    runs: [...(input.extraRunDates ?? [])].map((day) => ({
      id: `extra-${day}`,
      day,
      distance: 5000,
      duration: 1800,
    })),
  });
}

/** One day of that week, for a test of Home's day card (`DayPeekCard`). */
export function weekDay(
  input: Parameters<typeof stripWeek>[0] & { dateKey: string }
): LayoutDay | null {
  return stripWeek(input).days.find((d) => d.date === input.dateKey) ?? null;
}
