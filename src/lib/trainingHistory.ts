import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "./dateHelpers";
import { workoutTitle } from "./workoutLabels";
import { workoutTonnageKg, type Workout } from "./savedWorkouts";
import { liftUnitLabel, liftVolumeIn, type LiftUnit } from "./liftLoad";
import type { SavedRun } from "./savedRuns";
import {
  distanceLabel,
  finishTimeLabel,
  paceLabel,
  runTitle,
} from "./runLabels";
import type { DistanceUnit } from "./distanceUnits";
import { isVolumeEligible } from "./runStatsEligibility";
import { formatDayMonthYear } from "@/utils/formatters";

export const HISTORY_PAGE_SIZE = 30;
export type HistorySport = "all" | "lifts" | "runs";
export interface HistoryDates {
  from: string;
  to: string;
}
export interface TrainingHistoryFilters extends HistoryDates {
  sport: HistorySport;
  search: string;
}

/** Date keys are local calendar days, including across DST and year boundaries. */
export function validHistoryDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    localDateString(parseLocalDate(value)) === value
  );
}

export function historyDatePresets(
  today: string
): { label: string; dates: HistoryDates }[] {
  return [
    {
      label: "This week",
      dates: { from: localWeekKey(parseLocalDate(today)), to: today },
    },
    {
      label: "Last 30 days",
      dates: {
        from: localDateString(addLocalDays(parseLocalDate(today), -29)),
        to: today,
      },
    },
    {
      label: "This month",
      dates: { from: `${today.slice(0, 7)}-01`, to: today },
    },
  ];
}

/** Move to the 30 calendar days immediately before the visible period. */
export function previousHistoryWindow(dates: HistoryDates): HistoryDates {
  const firstDay = parseLocalDate(dates.from);
  return {
    from: localDateString(addLocalDays(firstDay, -30)),
    to: localDateString(addLocalDays(firstDay, -1)),
  };
}

export function trainingHistoryFilters(
  params: URLSearchParams,
  today: string
): TrainingHistoryFilters {
  const defaults = historyDatePresets(today)[1].dates;
  const from = params.get("from") ?? defaults.from;
  const to = params.get("to") ?? defaults.to;
  const dates =
    validHistoryDate(from) && validHistoryDate(to) && from <= to
      ? { from, to }
      : defaults;
  const sport = params.get("sport");
  return {
    ...dates,
    sport: sport === "lifts" || sport === "runs" ? sport : "all",
    search: (params.get("q") ?? "").slice(0, 120),
  };
}

export function historyDateLabel(dates: HistoryDates, today: string): string {
  return (
    historyDatePresets(today).find(
      ({ dates: preset }) =>
        preset.from === dates.from && preset.to === dates.to
    )?.label ??
    `${formatDayMonthYear(parseLocalDate(dates.from))} – ${formatDayMonthYear(parseLocalDate(dates.to))}`
  );
}

export function trainingHistorySearch(filters: TrainingHistoryFilters): string {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.sport !== "all") params.set("sport", filters.sport);
  if (filters.search) params.set("q", filters.search);
  return `?${params}`;
}

export interface HistorySession {
  key: string;
  id: string;
  kind: "lift" | "run";
  day: string;
  /** When the session was saved, in ms; 0 when an old record has no time. */
  savedAtMs: number;
  title: string;
  summary: string[];
  href: string;
  notCounted: boolean;
}

function workoutSavedAtMs(workout: Workout): number {
  const created = workout.createdAt as { toMillis?: () => number } | null;
  const ms = typeof created?.toMillis === "function" ? created.toMillis() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

/** A day's sessions run newest first by when each was saved; a record with
 * no saved time, and a tie, fall back to its stable identity. */
export function trainingHistorySessions(
  workouts: readonly Workout[],
  runs: readonly SavedRun[],
  filters: TrainingHistoryFilters,
  unit: DistanceUnit,
  liftUnit: LiftUnit = "kg"
): HistorySession[] {
  const sessions: HistorySession[] = [];
  // What a search matches beyond the title: a lift's exercises, so "bench"
  // finds the session it was done in.
  const alsoMatches = new Map<string, string[]>();
  if (filters.sport !== "runs") {
    for (const workout of workouts) {
      const exercises = workout.exercises.length;
      const minutes = workout.durationMinutes;
      const volume = workoutTonnageKg(workout);
      alsoMatches.set(
        `lift:${workout.id}`,
        workout.exercises.map((exercise) => exercise.exerciseName ?? "")
      );
      sessions.push({
        key: `lift:${workout.id}`,
        id: workout.id,
        kind: "lift",
        day: workout.date,
        savedAtMs: workoutSavedAtMs(workout),
        title: workoutTitle(workout),
        summary: [
          ...(Number.isFinite(minutes) && minutes > 0
            ? [`${Math.max(1, Math.round(minutes))} min`]
            : []),
          `${exercises} ${exercises === 1 ? "exercise" : "exercises"}`,
          ...(volume > 0
            ? [
                `${Math.round(liftVolumeIn(volume, liftUnit)).toLocaleString()} ${liftUnitLabel(liftUnit)}`,
              ]
            : []),
        ],
        href: `/workout/${encodeURIComponent(workout.id)}`,
        notCounted: false,
      });
    }
  }
  if (filters.sport !== "lifts") {
    for (const run of runs) {
      sessions.push({
        key: `run:${run.id}`,
        id: run.id,
        kind: "run",
        day: run.day,
        savedAtMs: Number.isFinite(run.completedAt?.getTime())
          ? run.completedAt.getTime()
          : 0,
        title: runTitle(run),
        summary: [
          distanceLabel(run.distance, unit),
          finishTimeLabel(run.duration),
          ...(run.distance > 0 && run.duration > 0
            ? [paceLabel((run.duration / run.distance) * 1000, unit)]
            : []),
        ],
        href: `/run/${encodeURIComponent(run.id)}`,
        notCounted: !isVolumeEligible(run),
      });
    }
  }
  const search = filters.search.trim().toLocaleLowerCase();
  return sessions
    .filter(
      (session) =>
        session.day >= filters.from &&
        session.day <= filters.to &&
        (!search ||
          [session.title, ...(alsoMatches.get(session.key) ?? [])].some(
            (text) => text.toLocaleLowerCase().includes(search)
          ))
    )
    .sort(
      (a, b) =>
        b.day.localeCompare(a.day) ||
        b.savedAtMs - a.savedAtMs ||
        a.key.localeCompare(b.key)
    );
}

/** Only the history route is accepted from a saved detail's router state. */
export function trainingHistoryReturnTo(state: unknown): string | null {
  const returnTo = (state as { trainingHistoryReturnTo?: unknown } | null)
    ?.trainingHistoryReturnTo;
  return typeof returnTo === "string" &&
    /^\/history\/sessions(?:\?[^#]*)?$/.test(returnTo)
    ? returnTo
    : null;
}
