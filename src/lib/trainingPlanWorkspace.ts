import type {
  ProgramState,
  ScheduledRunDay,
  WorkoutDay,
} from "@/features/program/programTypes";
import { nextUpIndex } from "@/features/program/nextUpCursor";
import type { UserProfile } from "./auth";
import type { Workout } from "./savedWorkouts";
import type { SavedRun } from "./savedRuns";
import type { ClaimState } from "./scheduledRunCompletion";
import { getCompletionKind } from "./scheduledRunCompletion";
import { localWeekKey, parseLocalDate } from "./dateHelpers";
import { resolveTrainingWindow } from "./trainingResolver";
import { beforeStart, startDayKey } from "./startDay";
import { canRescheduleRun } from "./runReschedule";
import { isVolumeEligible } from "./runStatsEligibility";
import {
  distanceLabel,
  runTemplateName,
  runTitle,
  runTypeTitle,
} from "./runLabels";
import { resolveDistanceUnit } from "./distanceUnits";
import { runDoseLine, runMinutesLine } from "./runDose";
import { planningEasyPaceSPerKm } from "./runPaces";
import { formatDuration, formatShortWeekday } from "@/utils/formatters";
import { workoutTitle } from "./workoutLabels";
import { trainingWeek, type WeekCount } from "./trainingWeek";

export interface WorkspaceActivity {
  id: string;
  kind: "lift" | "run";
  title: string;
  meta: string;
  href: string | null;
  completed: boolean;
  /** Present for a scheduled run, including one linked to a saved run. */
  runDay?: ScheduledRunDay;
  /** Source eligibility only. The destination picker and active-session guard
   * perform their own validation before exposing/committing a move. */
  canMove: boolean;
}

export interface WorkspaceDay {
  dateKey: string;
  dayIndex: number;
  isToday: boolean;
  beforeStart: boolean;
  plannedLift: boolean;
  activities: WorkspaceActivity[];
  isEmpty: boolean;
}

export interface TrainingPlanWorkspace {
  weekKey: string;
  days: WorkspaceDay[];
  nextLiftIndex: number | null;
  nextLift: WorkoutDay | null;
  /** The two lifts after the next one, in rotation order ("Then Pull ·
   *  Legs"): an order, not dates (ADR-0002). */
  thenLifts: string[];
  /** The week's lifts and runs, done against planned, as Home's week and
   *  the weekly review count them (`trainingWeek`); and its rest days. */
  summary: { lifts: WeekCount; runs: WeekCount; restDays: number };
}

export interface TrainingPlanWorkspaceInput {
  todayKey: string;
  profile: UserProfile | null;
  programState: ProgramState | null;
  workouts: readonly Workout[];
  runs: readonly SavedRun[];
  claimMap: Map<string, ClaimState>;
}

/** Read-only calendar model. Lifting names belong to actual dated records
 * and the next-up rotation cursor, never projected future weekdays (ADR-0002).
 * Scheduled run matching/completion stays in the shared training resolver.
 *
 * A day that has passed reads as Home's week strip reads it: what was done,
 * what was missed, or nothing to say. A lift slot done on another day is
 * settled, not missed, and no date is given a lift it did not hold. A run
 * done on another day than planned shows once, on its planned date, saying
 * when it was done. */
export function buildTrainingPlanWorkspace({
  todayKey,
  profile,
  programState,
  workouts,
  runs,
  claimMap,
}: TrainingPlanWorkspaceInput): TrainingPlanWorkspace {
  const weekKey = localWeekKey(parseLocalDate(todayKey));
  const unit = resolveDistanceUnit(profile?.preferredDistanceUnit);
  const startKey = startDayKey(profile?.createdAt);
  const resolved = resolveTrainingWindow({
    startDate: parseLocalDate(weekKey),
    days: 7,
    todayKey,
    profile,
    programState,
    claimMap,
  });
  const runById = new Map(runs.map((run) => [run.id, run]));
  // A saved run that completed one of this week's planned runs is shown on
  // that planned run, so it is not listed again as an extra on its own date.
  const shownOnPlan = new Set<string>();
  for (const day of resolved) {
    const id = day.run.runDay?.id;
    const claimed = id ? claimMap.get(id)?.claimedSavedRunId : undefined;
    if (claimed && runById.has(claimed) && !beforeStart(day.dateKey, startKey))
      shownOnPlan.add(claimed);
  }

  const days = resolved.map((day): WorkspaceDay => {
    const priorToAccount = beforeStart(day.dateKey, startKey);
    const isPast = day.dateKey < todayKey;
    const plannedLift =
      !priorToAccount &&
      !!programState?.workouts.length &&
      (day.scheduleType === "lift" || day.scheduleType === "both");
    const savedLifts = workouts.filter(
      (workout) => workout.date === day.dateKey
    );
    const activities: WorkspaceActivity[] = savedLifts.map((workout) => ({
      id: `workout:${workout.id}`,
      kind: "lift",
      title: workoutTitle(workout),
      meta: [
        "Completed",
        workout.durationMinutes > 0
          ? formatDuration(workout.durationMinutes * 60)
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/workout/${encodeURIComponent(workout.id)}`,
      completed: true,
      canMove: false,
    }));

    if (plannedLift && savedLifts.length === 0) {
      // The resolver projects the rotation slot's state onto today and the
      // past only; a slot done or skipped on another day settles this one.
      activities.push({
        id: `lift-day:${day.dateKey}`,
        kind: "lift",
        title: "Lift day",
        meta:
          day.lift.status === "completed"
            ? "Done on another day"
            : day.lift.status === "skipped"
              ? "Skipped"
              : isPast
                ? "Missed"
                : "Planned · follows your rotation",
        href: "/program?tab=lift",
        completed: false,
        canMove: false,
      });
    }

    const planned = day.run.runDay;
    const claimedSavedId = planned?.id
      ? claimMap.get(planned.id)?.claimedSavedRunId
      : undefined;
    const claimedRun = claimedSavedId ? runById.get(claimedSavedId) : undefined;
    const doneOn =
      claimedRun && claimedRun.day !== day.dateKey ? claimedRun.day : null;

    if (planned && !priorToAccount) {
      const done = day.run.isCompleted;
      const manual = planned.id
        ? getCompletionKind(planned.id, claimMap) === "manual"
        : false;
      const label = done
        ? doneOn
          ? `Done ${formatShortWeekday(parseLocalDate(doneOn))}`
          : manual
            ? "Marked complete"
            : "Completed"
        : day.run.status === "skipped"
          ? "Skipped"
          : day.run.status === "race_no_show"
            ? "Race not recorded"
            : isPast
              ? "Missed"
              : "Planned";
      const dose = claimedRun
        ? distanceLabel(claimedRun.distance, unit)
        : day.run.template
          ? day.run.template.config.targetDistanceKm
            ? [
                distanceLabel(
                  day.run.template.config.targetDistanceKm * 1000,
                  unit
                ),
                runMinutesLine(
                  day.run.template,
                  planningEasyPaceSPerKm(profile?.runFitness)
                ),
              ]
                .filter(Boolean)
                .join(" · ")
            : runDoseLine(
                day.run.template,
                planningEasyPaceSPerKm(profile?.runFitness)
              )
          : null;
      activities.push({
        id: `planned-run:${planned.id ?? day.dateKey}`,
        kind: "run",
        title: day.run.template
          ? runTemplateName(day.run.template.name, unit)
          : runTypeTitle(planned.type),
        meta: [label, dose].filter(Boolean).join(" · "),
        href: claimedRun
          ? `/run/${encodeURIComponent(claimedRun.id)}`
          : `/program?tab=run&rday=${day.dateKey}`,
        completed: done,
        runDay: planned,
        canMove:
          !done &&
          !!planned.id &&
          !!planned.weekKey &&
          !!planned.date &&
          canRescheduleRun(planned),
      });
    }

    // Unmatched extra activities remain visible, including invalid/saved-anyway
    // records. Their transparency label differs from a counted completion.
    for (const run of runs.filter((record) => record.day === day.dateKey)) {
      if (shownOnPlan.has(run.id)) continue;
      const completed = isVolumeEligible(run);
      activities.push({
        id: `saved-run:${run.id}`,
        kind: "run",
        title: runTitle(run),
        meta: [
          completed ? "Completed" : "Saved · Not counted",
          distanceLabel(run.distance, unit),
        ].join(" · "),
        href: `/run/${encodeURIComponent(run.id)}`,
        completed,
        canMove: false,
      });
    }

    return {
      dateKey: day.dateKey,
      dayIndex: day.dayIndex,
      isToday: day.dateKey === todayKey,
      beforeStart: priorToAccount,
      plannedLift,
      activities,
      isEmpty: activities.length === 0,
    };
  });
  const nextIndex = nextUpIndex(programState);
  const week = trainingWeek({
    weekKey,
    profile,
    programState,
    workouts,
    runs,
    now: parseLocalDate(todayKey),
  });
  return {
    weekKey,
    days,
    nextLiftIndex: nextIndex >= 0 ? nextIndex : null,
    nextLift: nextIndex >= 0 ? programState!.workouts[nextIndex] : null,
    thenLifts:
      nextIndex >= 0
        ? programState!.workouts
            .slice(nextIndex + 1)
            .filter((workout) => !workout.completed && !workout.skipped)
            .slice(0, 2)
            .map((workout) => workout.dayName)
        : [],
    summary: {
      lifts: week.lifts,
      runs: { done: week.runs.done, planned: week.runs.planned },
      restDays: days.filter((day) => day.isEmpty && !day.beforeStart).length,
    },
  };
}

/** "Lifts 1 of 3", or "Runs 2" when nothing is planned. Null when the week
 *  has neither planned nor done any, as Home's week leaves the column out. */
export function weekCountLabel(label: string, count: WeekCount): string | null {
  if (count.planned === null)
    return count.done > 0 ? `${label} ${count.done}` : null;
  return `${label} ${count.done} of ${count.planned}`;
}
