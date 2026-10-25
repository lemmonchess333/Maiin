import type { ProgramState } from "@/features/program/programTypes";
import type { SessionVariant } from "@/features/program/expressSession";
import {
  programmeDraftIdentity,
  type SessionDayContext,
} from "@/features/program/sessionDay";
import { countedSets } from "@/features/program/setLabels";
import type { WorkoutDraft } from "@/hooks/useWorkoutDraft";
import type { StoredRunSummary } from "@/lib/runResumeStorage";
import type { RunConfig } from "@/components/run/runConfigDefaults";
import { ACTIVITY_TYPES } from "@/components/run/runConfigDefaults";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { runSessionName } from "@/lib/runSessionAbout";
import type { RacePaceWork } from "@/lib/racePace";
import type { DistanceUnit } from "@/lib/distanceUnits";
import { RESUME_PARAM } from "@/lib/resumeParam";

/**
 * Sessions under way on this phone, as the screens outside them offer
 * them back: a workout closed with its sets kept (the workout draft) and a
 * run left or dropped before it was saved (the stored run).
 *
 * A workout is offered only when Train would open the same session from
 * it: its draft's identity must equal the one Train gives that day today,
 * in one of the ways a day can be started. Anything else (last week's
 * draft, a day edited since, a finished day) would make Resume open a
 * fresh session, so it is not offered.
 */

/** A session under way, as the In progress strip shows it. */
export interface SessionInProgress {
  sport: "lift" | "run";
  /** As its card names it: "Pull B", "Easy 30", "Free run". */
  name: string;
  /** A workout's working sets ticked so far; null for a run. */
  sets: number | null;
  /** Time spent in the session, in seconds. Time away from it is not
   *  counted, as resuming does not count it. */
  elapsedSeconds: number;
  /** Where Resume goes. */
  resumeTarget: string;
}

/** A programme workout that can be picked up where it was left. */
export interface ResumableLift {
  dayIndex: number;
  /** How it was started, which decides the session Train rebuilds. */
  variant: SessionVariant;
  sets: number;
  elapsedSeconds: number;
}

const VARIANTS: readonly SessionVariant[] = [
  "full",
  "time_budget",
  "easier_today",
  "express45",
  "express30",
];

/**
 * The newest draft Train can resume, or null. A day already finished or
 * skipped is not offered: Train does not start one.
 */
export function resumableLift(
  drafts: readonly WorkoutDraft[],
  programState: Pick<ProgramState, "workouts" | "weekNumber"> | null,
  context: SessionDayContext
): ResumableLift | null {
  if (!programState) return null;
  const newestFirst = [...drafts].sort((a, b) => b.savedAt - a.savedAt);
  for (const draft of newestFirst) {
    if (draft.completionPending) continue;
    if (!draft.identity.startsWith("v1|programme")) continue;
    const day = programState.workouts?.[draft.dayIndex];
    if (!day || day.completed || day.skipped) continue;
    const variant = VARIANTS.find(
      (v) =>
        programmeDraftIdentity(
          day,
          draft.dayIndex,
          programState.weekNumber,
          v,
          context
        ) === draft.identity
    );
    if (!variant) continue;
    return {
      dayIndex: draft.dayIndex,
      variant,
      sets: countedSets(draft.setLogs.flat()).filter((s) => s.completed).length,
      elapsedSeconds: draft.elapsedSeconds,
    };
  }
  return null;
}

export function liftInProgress(
  lift: ResumableLift,
  name: string
): SessionInProgress {
  return {
    sport: "lift",
    name,
    sets: lift.sets,
    elapsedSeconds: lift.elapsedSeconds,
    resumeTarget: `/program?day=${lift.dayIndex}&${RESUME_PARAM}=1`,
  };
}

export function runInProgress(
  run: StoredRunSummary,
  name: string
): SessionInProgress {
  return {
    sport: "run",
    name,
    sets: null,
    elapsedSeconds: run.accumulatedSeconds,
    resumeTarget: `/run?${RESUME_PARAM}=1`,
  };
}

/** The template a stored run was started from, if any. */
export function storedRunTemplate(config: RunConfig) {
  const id = config.planMetadata?.actualTemplateId;
  return id ? RUN_TEMPLATES.find((t) => t.id === id) : undefined;
}

/**
 * A run under way, named as its card names it: its template's name
 * ("Easy 30", "Long 15K with race pace"), else its type ("Free run",
 * "Tempo run").
 */
export function storedRunName(
  config: RunConfig,
  racePace: RacePaceWork | null,
  unit: DistanceUnit
): string {
  const typeName = ACTIVITY_TYPES.find(
    (o) => o.type === config.activityType
  )?.name;
  const fallback = typeName
    ? typeName.charAt(0) + typeName.slice(1).toLowerCase()
    : "Run";
  return runSessionName(storedRunTemplate(config), racePace, unit, fallback);
}
