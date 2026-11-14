import { intervalRestSeconds, plannedRepeatPace } from "./intervalRest";
import type { RunTemplate } from "./workoutTemplates";

type DoseTemplate = Pick<RunTemplate, "type" | "estimatedDuration" | "config">;

/**
 * A planned run's minutes, as the app states them (Run21 (5)), or null when
 * it has none to state. A timed run states its time ("40 min"): that is the
 * prescription, not an estimate. A long run states the minutes it takes at
 * the runner's own easy pace when a confirmed benchmark gives one ("about
 * 100 min", rounded to 5). Without one it states none: the template's
 * minutes assume 5:20 to 5:50 /km, so a slower runner's 15 km read "about
 * 80 min" and took over an hour and a half. A race's time is the race's to
 * tell. An interval session is timed the same way: at the runner's own
 * interval pace, with the rest that pace gives (`intervalRestSeconds`), when
 * a confirmed benchmark gives one; the template's minutes assume repeats of
 * about 3:40 /km.
 *
 * `easyPaceSPerKm` and `intervalPaceSPerKm` are the confirmed paces the
 * plan itself uses (`planningEasyPaceSPerKm`, `plannedIntervalPaceSPerKm`,
 * RUN-EV-08's gate): null without one.
 */
export function runMinutesLine(
  template: DoseTemplate,
  easyPaceSPerKm: number | null | undefined,
  intervalPaceSPerKm?: number | null
): string | null {
  const km = template.config.targetDistanceKm;
  const ownIntervals = intervalMinutes(template, intervalPaceSPerKm);
  if (ownIntervals !== null) return `about ${ownIntervals} min`;
  if (!km) return `${template.estimatedDuration} min`;
  if (template.type !== "long" || !easyPaceSPerKm || !(easyPaceSPerKm > 0))
    return null;
  return `about ${Math.round((km * easyPaceSPerKm) / 60 / 5) * 5} min`;
}

/** An interval session's minutes at the runner's interval pace, its
 *  repeats at their own pace (`plannedRepeatPace`, Run24 (5)), rounded to
 *  5; null without intervals or a pace, and for repeats run by feel, whose
 *  minutes are the template's. */
function intervalMinutes(
  template: DoseTemplate,
  intervalPaceSPerKm: number | null | undefined
): number | null {
  const iv = template.config.intervals;
  const paceSPerKm = plannedRepeatPace(template, intervalPaceSPerKm);
  if (!iv || !paceSPerKm || !(paceSPerKm > 0)) return null;
  const rep =
    iv.workDuration ??
    (iv.workDistance ? (iv.workDistance / 1000) * paceSPerKm : null);
  if (!rep) return null;
  const seconds =
    (iv.warmupDuration ?? 0) +
    (iv.cooldownDuration ?? 0) +
    iv.reps * rep +
    Math.max(0, iv.reps - 1) *
      intervalRestSeconds(iv, paceSPerKm, template.config.repeatsAt);
  return Math.round(seconds / 60 / 5) * 5;
}

/**
 * A planned run's dose, as its cards state it (Run21 (5)): its distance, if
 * it has one, then its minutes, if it has any (`runMinutesLine`). "40 min",
 * "15 km", "15 km · about 100 min".
 */
export function runDoseLine(
  template: DoseTemplate,
  easyPaceSPerKm: number | null | undefined,
  intervalPaceSPerKm?: number | null
): string {
  const km = template.config.targetDistanceKm;
  const minutes = runMinutesLine(template, easyPaceSPerKm, intervalPaceSPerKm);
  return km ? [`${km} km`, minutes].filter(Boolean).join(" · ") : minutes!;
}
