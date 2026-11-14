/**
 * The run summary's pace verdict for a finished run (`RunSummary.tsx`, which
 * shows its line and saves its tone as `paceVerdictTone`), as a function of
 * what the run carries, so a test or the simulator calls the code the screen
 * runs (ADR-0008).
 *
 * Only a run that did its planned session is judged: a custom or extra run
 * has no honest target. Intervals are not judged either, because the
 * session's average mixes work and rest (the same reason the summary's
 * primary stat swaps to the work sets for them), nor is a run-walk session
 * (Run20 (5)), whose average mixes runs and walks. The target is the session's
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
 *
 * A run on the treadmill is not judged either. Since Pgm8 it is the planned
 * run, but its distance is typed in at the end: with no distance while it
 * ran, there is no record of its work segments, so a treadmill tempo would
 * be judged on an average carrying its warm-up and cool-down, read slow and
 * feed the "Take this week easier?" nudge (A6). A typed distance sets no
 * pace record either (`isPaceEligible`).
 *
 * A run started on a hot day (`RunConfig.hotDay`) is never judged slow:
 * heat slows running at the same effort (Ely 2007; El Helou 2012;
 * running-evidence.md §4.12), which says not to mark a hot day's run a
 * miss. A slow one's tone is "heat", which the easier-week nudge counts
 * neither way, and its line says slower is expected, where the cooler
 * day's "slow" would have spoken (Run21 (6) keeps an easy run quiet). On
 * target and quicker are judged as on any day: running hard in heat is
 * the mistake to name. A run adjusted for heat (`RunConfig.heatAdjustment`)
 * is judged against the paces it was set, the eased table
 * (`heatEasedPaceTable`); one adjusted to effort only, on an extreme day,
 * had no pace targets, so its pace is not judged at all.
 */
import type { DistanceUnit } from "./distanceUnits";
import { resolvePaceVerdict, type PaceVerdict } from "./paceVerdict";
import {
  paceTableFromFitness,
  raceDistanceKeyFromKm,
  resolveSessionPaces,
} from "./runPaces";
import { getAdherenceLabel, type RunPlanMetadata } from "./runPlanMetadata";
import { RUN_TEMPLATES, isRunWalkTemplateId } from "./workoutTemplates";
import { isTreadmillRun } from "./runGuards";
import {
  HEAT_FEEL_VERDICT_LINE,
  heatEasedPaceTable,
  heatSlowVerdictLine,
  type HeatAdjustment,
} from "./heatAdjustment";
import { paceLabel } from "./runLabels";

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
  /** Where the run was done (`RunConfig.place`): none is judged on a
   *  treadmill. */
  place?: string | null;
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
  /** The run started on a hot day (`RunConfig.hotDay`): never slow. */
  hotDay?: boolean;
  /** The run's heat adjustment (`RunConfig.heatAdjustment`): judged
   *  against the eased paces it was set. */
  heatAdjustment?: HeatAdjustment | null;
}): PaceVerdict | null {
  const { planMetadata: pm, avgPaceSeconds, distance } = args;
  if (getAdherenceLabel(pm) !== "Planned") return null;
  if (isTreadmillRun({ place: args.place })) return null;
  const tmplId = pm?.plannedTemplateId || pm?.actualTemplateId;
  const tmpl = tmplId ? RUN_TEMPLATES.find((t) => t.id === tmplId) : null;
  // Run24 (5): a long run with race-pace blocks averages its easy running
  // and its race pace, so its whole-run pace is no verdict on either.
  if (
    !tmpl ||
    tmpl.type === "intervals" ||
    isRunWalkTemplateId(tmpl.id) ||
    tmpl.config.racePaceBlocks
  )
    return null;
  if (!(avgPaceSeconds > 0) || (distance || 0) < 500) return null;
  const heat = args.heatAdjustment ?? null;
  if (heat?.effortOnly)
    return { tone: "heat", line: HEAT_FEEL_VERDICT_LINE, speaks: false };
  const fitnessTable = paceTableFromFitness(args.runFitness ?? null);
  const table = heat ? heatEasedPaceTable(fitnessTable, heat) : fitnessTable;
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
  const verdict = resolvePaceVerdict({
    templateType: tmpl.type,
    actualPaceS: judged,
    targetPaceS: pinned ?? target,
    // Band-aware verdict (Runna teardown #2): anywhere inside the session's
    // pace window is on-target, and the copy speaks the range. A pinned
    // goal pace has no window.
    targetBandS: pinned ? undefined : paces.band,
    unit: args.unit,
  });
  const hot = args.hotDay === true || heat !== null;
  if (!verdict || !hot || verdict.tone !== "slow") return verdict;
  return {
    tone: "heat",
    line: heatSlowVerdictLine(paceLabel(judged, args.unit)),
    speaks: verdict.speaks,
  };
}
