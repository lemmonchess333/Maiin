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
import { formatDuration } from "@/utils/formatters";
import { workoutTitle } from "./workoutLabels";

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
  summary: { liftDays: number; plannedRuns: number; restDays: number };
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
 * Scheduled run matching/completion stays in the shared training resolver. */
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
  const claimedIds = new Set<string>();

  // A matched saved run is an actual activity on its START date. If it is
  // recorded on a different date from the planned slot, render it there once
  // instead of manufacturing a second dated completion on the plan's date.
  for (const claim of claimMap.values()) {
    if (claim.claimedSavedRunId && runById.has(claim.claimedSavedRunId)) {
      claimedIds.add(claim.claimedSavedRunId);
    }
  }

  const days = resolved.map((day): WorkspaceDay => {
    const priorToAccount = beforeStart(day.dateKey, startKey);
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
      activities.push({
        id: `lift-day:${day.dateKey}`,
        kind: "lift",
        title: "Lift day",
        meta: "Planned · follows your rotation",
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
    const completedOnAnotherDate = claimedRun && claimedRun.day !== day.dateKey;

    if (planned && !priorToAccount && !completedOnAnotherDate) {
      const done = day.run.isCompleted;
      const manual = planned.id
        ? getCompletionKind(planned.id, claimMap) === "manual"
        : false;
      const label = done
        ? manual
          ? "Marked complete"
          : "Completed"
        : day.run.status === "skipped"
          ? "Skipped"
          : day.run.status === "race_no_show"
            ? "Race not recorded"
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
      if (claimedIds.has(run.id) && claimedRun?.id === run.id) continue;
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
  return {
    weekKey,
    days,
    nextLiftIndex: nextIndex >= 0 ? nextIndex : null,
    nextLift: nextIndex >= 0 ? programState!.workouts[nextIndex] : null,
    summary: {
      liftDays: days.filter((day) => day.plannedLift).length,
      plannedRuns: resolved.filter(
        (day) => !!day.run.runDay && !beforeStart(day.dateKey, startKey)
      ).length,
      restDays: days.filter((day) => day.isEmpty && !day.beforeStart).length,
    },
  };
}
