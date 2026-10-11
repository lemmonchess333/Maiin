/**
 * The run summary's pace verdict for a finished run (`RunSummary.tsx`, which
 * shows its line and saves its tone as `paceVerdictTone`), as a function of
 * what the run carries, so a test or the simulator calls the code the screen
 * runs (ADR-0008).
 *
 * Only a run that did its planned session is judged: a custom or extra run
 * has no honest target. Intervals are not judged either, because the
 * session's average mixes work and rest (the same reason the summary's
 * primary stat swaps to the work sets for them). The target is the session's
 * pace from the runner's fitness (`resolveSessionPaces`): its window when it
 * has one, otherwise its single pace. `resolvePaceVerdict` decides the tone
 * and the words.
 *
 * A tempo is judged by its work segments, the tempo blocks, when the run
 * recorded them (`workPortion`): the whole run's average carries the
 * warm-up and cool-down, so a tempo held at its pace read slow, and the
 * slow tones fed the "Take this week easier?" nudge. Every other session,
 * and a tempo with no record of its blocks, is judged by the whole run, as
 * before: an easy run's strides are not what it is judged on.
 *
 * A goal-pace tempo (race build and taper) is judged against the goal pace
 * its blocks pinned, not the threshold window: a marathon pace sits 9-27 s
 * a km past that window's slow edge (VDOT 60 to 30), so a goal-pace tempo
 * held exactly read slow for most marathoners.
 */
import type { DistanceUnit } from "./distanceUnits";
import { resolvePaceVerdict, type PaceVerdict } from "./paceVerdict";
import {
  paceTableFromFitness,
  raceDistanceKeyFromKm,
  resolveSessionPaces,
} from "./runPaces";
import { getAdherenceLabel, type RunPlanMetadata } from "./runPlanMetadata";
import { RUN_TEMPLATES } from "./workoutTemplates";

/** The least a run's work segments must cover to be judged on: a few
 *  hundred metres and a minute, so a block cut short isn't read as one. */
const MIN_WORK_METERS = 400;
const MIN_WORK_SECONDS = 60;

/** The pace over a run's work segments, seconds per km, or null where
 *  they covered too little to judge (or the run recorded none). */
export function workPaceSeconds(
  work: { seconds: number; meters: number } | null | undefined
): number | null {
  if (!work) return null;
  if (!(work.meters >= MIN_WORK_METERS) || !(work.seconds >= MIN_WORK_SECONDS))
    return null;
  return (work.seconds / work.meters) * 1000;
}

export function plannedRunVerdict(args: {
  planMetadata: RunPlanMetadata | null | undefined;
  /** The whole run's average pace, seconds per km. */
  avgPaceSeconds: number;
  /** The pace over the session's work segments (`workPaceSeconds`), which
   *  a tempo is judged by when the run has one. */
  workPaceSeconds?: number | null;
  /** The pace the session pinned as its prescription (`pinnedWorkPace`):
   *  a goal-pace tempo is judged against it. */
  pinnedPaceSeconds?: number | null;
  /** Metres. */
  distance: number;
  runFitness: Parameters<typeof paceTableFromFitness>[0];
  unit: DistanceUnit;
}): PaceVerdict | null {
  const { planMetadata: pm, avgPaceSeconds, distance } = args;
  if (getAdherenceLabel(pm) !== "Planned") return null;
  const tmplId = pm?.plannedTemplateId || pm?.actualTemplateId;
  const tmpl = tmplId ? RUN_TEMPLATES.find((t) => t.id === tmplId) : null;
  if (!tmpl || tmpl.type === "intervals") return null;
  if (!(avgPaceSeconds > 0) || (distance || 0) < 500) return null;
  const table = paceTableFromFitness(args.runFitness ?? null);
  if (!table) return null;
  const paces = resolveSessionPaces(tmpl.type, table, {
    raceDistanceKey: raceDistanceKeyFromKm(tmpl.config.targetDistanceKm),
  });
  const target =
    paces.targetPace ??
    paces.workPace ??
    (paces.band ? (paces.band[0] + paces.band[1]) / 2 : undefined);
  if (!target) return null;
  const tempo = tmpl.type === "tempo";
  const judged =
    tempo && args.workPaceSeconds && args.workPaceSeconds > 0
      ? args.workPaceSeconds
      : avgPaceSeconds;
  const pinned =
    tempo && args.pinnedPaceSeconds && args.pinnedPaceSeconds > 0
      ? args.pinnedPaceSeconds
      : null;
  return resolvePaceVerdict({
    templateType: tmpl.type,
    actualPaceS: judged,
    targetPaceS: pinned ?? target,
    // Band-aware verdict (Runna teardown #2): anywhere inside the session's
    // pace window is on-target, and the copy speaks the range. A pinned
    // goal pace has no window.
    targetBandS: pinned ? undefined : paces.band,
    unit: args.unit,
  });
}
