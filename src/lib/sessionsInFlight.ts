import type { ProgramState } from "@/features/program/programTypes";
import type { SessionVariant } from "@/features/program/expressSession";
import {
  programmeDraftIdentity,
  type SessionDayContext,
} from "@/features/program/sessionDay";
import {
  draftRoutineId,
  routineDraftIdentity,
  type RoutineLayout,
} from "@/features/program/routineSession";
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
 * A workout is offered only when Resume would open the same session from
 * it. A programme day's draft must have the identity Train gives that day
 * today, in one of the ways a day can be started; a saved routine's must
 * have the one its routine builds as it is now (`routineSession.ts`), so a
 * routine deleted since, or renamed, or with an exercise or a set count
 * changed, is not offered. Anything else (last week's draft, a day edited
 * since, a finished day) would make Resume open a fresh session.
 */

/** A session under way, as the In progress strip shows it. */
export interface SessionInProgress {
  sport: "lift" | "run";
  /** As its card names it: "Pull B", "Easy 30", "Free run", or a
   *  routine's own name. */
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

/** A saved routine's workout that can be picked up where it was left. */
export interface ResumableRoutine {
  routineId: string;
  /** The routine's name, as its page names the workout. */
  name: string;
  sets: number;
  elapsedSeconds: number;
}

/** The workout under way: a programme day's or a saved routine's. */
export type ResumableWorkout =
  | ({ kind: "programme" } & ResumableLift)
  | ({ kind: "routine" } & ResumableRoutine);

/** The saved routines the drafts were kept from, as they are now, by id
 *  (`useSessionsInFlight`). A routine deleted since is absent. */
export type RoutinesInFlight = ReadonlyMap<string, RoutineLayout>;

const VARIANTS: readonly SessionVariant[] = [
  "full",
  "time_budget",
  "easier_today",
  "express45",
  "express30",
];

function newestFirst(drafts: readonly WorkoutDraft[]): WorkoutDraft[] {
  return [...drafts].sort((a, b) => b.savedAt - a.savedAt);
}

function setsDone(draft: WorkoutDraft): number {
  return countedSets(draft.setLogs.flat()).filter((s) => s.completed).length;
}

/** A programme day's draft as Train would resume it, or null. A day
 *  already finished or skipped is not offered: Train does not start one. */
function programmeDraftResumable(
  draft: WorkoutDraft,
  programState: Pick<ProgramState, "workouts" | "weekNumber">,
  context: SessionDayContext
): ResumableLift | null {
  if (!draft.identity.startsWith("v1|programme")) return null;
  const day = programState.workouts?.[draft.dayIndex];
  if (!day || day.completed || day.skipped) return null;
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
  if (!variant) return null;
  return {
    dayIndex: draft.dayIndex,
    variant,
    sets: setsDone(draft),
    elapsedSeconds: draft.elapsedSeconds,
  };
}

/** A routine's draft as its page would resume it, or null: its routine
 *  must still exist and still build the session the draft was kept from. */
function routineDraftResumable(
  draft: WorkoutDraft,
  routines: RoutinesInFlight
): ResumableRoutine | null {
  const routineId = draftRoutineId(draft);
  if (routineId === null) return null;
  const routine = routines.get(routineId);
  if (!routine || routineDraftIdentity(routine) !== draft.identity)
    return null;
  return {
    routineId,
    name: routine.name,
    sets: setsDone(draft),
    elapsedSeconds: draft.elapsedSeconds,
  };
}

/** The newest programme draft Train can resume, or null. */
export function resumableLift(
  drafts: readonly WorkoutDraft[],
  programState: Pick<ProgramState, "workouts" | "weekNumber"> | null,
  context: SessionDayContext
): ResumableLift | null {
  if (!programState) return null;
  for (const draft of newestFirst(drafts)) {
    if (draft.completionPending) continue;
    const lift = programmeDraftResumable(draft, programState, context);
    if (lift) return lift;
  }
  return null;
}

/**
 * The workout under way, or null: the newest draft Resume can open, a
 * programme day's or a saved routine's. One workout is offered at a time,
 * as one is done at a time.
 */
export function resumableWorkout(
  drafts: readonly WorkoutDraft[],
  programState: Pick<ProgramState, "workouts" | "weekNumber"> | null,
  context: SessionDayContext,
  routines: RoutinesInFlight
): ResumableWorkout | null {
  for (const draft of newestFirst(drafts)) {
    if (draft.completionPending) continue;
    const lift = programState
      ? programmeDraftResumable(draft, programState, context)
      : null;
    if (lift) return { kind: "programme", ...lift };
    const routine = routineDraftResumable(draft, routines);
    if (routine) return { kind: "routine", ...routine };
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

/** A routine's workout under way: Resume opens the routine's page, which
 *  carries on without asking again. */
export function routineInProgress(
  routine: ResumableRoutine
): SessionInProgress {
  return {
    sport: "lift",
    name: routine.name,
    sets: routine.sets,
    elapsedSeconds: routine.elapsedSeconds,
    resumeTarget: `/routine/${encodeURIComponent(routine.routineId)}?${RESUME_PARAM}=1`,
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
