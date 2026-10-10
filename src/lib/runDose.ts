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
 * tell.
 *
 * `easyPaceSPerKm` is the confirmed easy pace the plan itself uses
 * (`planningEasyPaceSPerKm`, RUN-EV-08's gate): null without one.
 */
export function runMinutesLine(
  template: DoseTemplate,
  easyPaceSPerKm: number | null | undefined
): string | null {
  const km = template.config.targetDistanceKm;
  if (!km) return `${template.estimatedDuration} min`;
  if (template.type !== "long" || !easyPaceSPerKm || !(easyPaceSPerKm > 0))
    return null;
  return `about ${Math.round((km * easyPaceSPerKm) / 60 / 5) * 5} min`;
}

/**
 * A planned run's dose, as its cards state it (Run21 (5)): its distance, if
 * it has one, then its minutes, if it has any (`runMinutesLine`). "40 min",
 * "15 km", "15 km · about 100 min".
 */
export function runDoseLine(
  template: DoseTemplate,
  easyPaceSPerKm: number | null | undefined
): string {
  const km = template.config.targetDistanceKm;
  const minutes = runMinutesLine(template, easyPaceSPerKm);
  return km ? [`${km} km`, minutes].filter(Boolean).join(" · ") : minutes!;
}
