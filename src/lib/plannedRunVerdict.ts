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

export function plannedRunVerdict(args: {
  planMetadata: RunPlanMetadata | null | undefined;
  /** The whole run's average pace, seconds per km. */
  avgPaceSeconds: number;
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
  return resolvePaceVerdict({
    templateType: tmpl.type,
    actualPaceS: avgPaceSeconds,
    targetPaceS: target,
    // Band-aware verdict (Runna teardown #2): anywhere inside the session's
    // pace window is on-target, and the copy speaks the range.
    targetBandS: paces.band,
    unit: args.unit,
  });
}
