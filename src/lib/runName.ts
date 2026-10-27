/**
 * A run's name: the one it is saved and posted under.
 *
 * A lift posts under its session's name, and Strava, Nike Run Club, Runna
 * and Garmin all name a run from what it was and let the runner change it
 * before saving. So a run takes the planned session's name, else the run
 * type's, else the time of day, in a field on the finish screen the runner
 * can edit.
 *
 * Pure, with no Firebase, so the E2E journeys' copy of the saved run
 * (`e2e/helpers/journeyRunDoc.ts`) names a run with this same code.
 */
import type { RunConfig } from "@/components/run/runConfigDefaults";
import type { DistanceUnit } from "@/lib/distanceUnits";
import type { RacePaceWork } from "@/lib/racePace";
import { runSessionName, runTypeTitle } from "@/lib/runLabels";
import { RUN_TEMPLATES, type RunTemplate } from "@/lib/workoutTemplates";

/** The longest name a run is saved under. The rules allow a post's title
 *  200 characters; a name is a line on a card, not a note. */
export const RUN_NAME_MAX = 80;

/** What naming a run reads of it. */
export interface NameableRun {
  runConfig?: Pick<
    RunConfig,
    "activityType" | "planMetadata" | "guidedWorkout"
  > | null;
  /** Epoch ms of the first fix, before privacy zones cut the trace. */
  startedAt?: number;
  points?: { timestamp?: number }[];
  /** The runner's own name for it, typed on the finish screen. */
  name?: string;
}

/**
 * The session a run was, for its name: the template it was started from,
 * else the plan's when the run was the planned one. A template of another
 * type than the run names nothing: a tempo launched and changed to an
 * easy run is an easy run.
 */
export function runNameTemplate(
  runConfig: NameableRun["runConfig"]
): RunTemplate | null {
  const plan = runConfig?.planMetadata;
  const id =
    plan?.actualTemplateId ?? (plan?.offPlan ? null : plan?.plannedTemplateId);
  const template = id ? RUN_TEMPLATES.find((t) => t.id === id) : undefined;
  if (!template) return null;
  const type = runConfig?.activityType;
  return !type || type === template.type ? template : null;
}

/** The types with a name of their own. A free run, a manual one and a
 *  treadmill run with no session are named by the time of day. */
const NAMED_TYPES = new Set(["easy", "tempo", "intervals", "long", "race"]);

/** Morning to noon, afternoon to five, evening to nine, then night, by
 *  the phone's clock where the run started. */
function timeOfDayRunName(start: Date): string {
  const hour = start.getHours();
  if (hour >= 4 && hour < 12) return "Morning run";
  if (hour >= 12 && hour < 17) return "Afternoon run";
  if (hour >= 17 && hour < 21) return "Evening run";
  return "Night run";
}

/**
 * A run's name, from what it was: the planned session's name ("20 Min
 * Tempo", in Run21 (2)'s words, a race-pace finish included), else a
 * guided workout's, else its type's ("Long run"), else when in the day it
 * started ("Morning run").
 */
export function runPostName(
  run: NameableRun,
  {
    unit = "km",
    racePace = null,
    now = new Date(),
  }: {
    /** A long run is named in the runner's unit (`runTemplateName`). */
    unit?: DistanceUnit;
    /** The session's work at the goal race pace (`racePaceWorkFor`). */
    racePace?: RacePaceWork | null;
    now?: Date;
  } = {}
): string {
  const template = runNameTemplate(run.runConfig);
  if (template) return runSessionName(template, racePace, unit);
  const config = run.runConfig;
  const type = config?.activityType;
  if (type === "guided")
    return config?.guidedWorkout?.name || runTypeTitle(type);
  if (type && NAMED_TYPES.has(type)) return runTypeTitle(type);
  const first = run.startedAt ?? run.points?.[0]?.timestamp;
  return timeOfDayRunName(first ? new Date(first) : now);
}

/** The name a run is saved and posted under: the runner's own, trimmed
 *  and capped, else the one it was given. */
export function runNameOf(run: NameableRun, now: Date = new Date()): string {
  const own = run.name?.trim().slice(0, RUN_NAME_MAX).trim();
  return own || runPostName(run, { now });
}
