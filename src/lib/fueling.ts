/**
 * fueling (roadmap A8) — the hybrid moat: the training plan informing the
 * nutrition surfaces. Two of A8's three pieces already shipped elsewhere
 * and are deliberately NOT duplicated here:
 *
 *  - day-OF long-run carb targeting — the dayIntensity classifier already
 *    tiers a scheduled long run HARD, which drives the biggest fat→carb
 *    shift in phaseNutrition;
 *  - race-week carb load — taperNutrition owns the final-days calorie
 *    bump + carb-max split and its "Race week — carb load" caption.
 *
 * This module adds the two genuinely missing pieces:
 *
 *  1. THE EVE OF A LONG RUN. Glycogen for a morning long run is filled
 *     the day before, but the classifier only reads the day's OWN plan —
 *     the eve of a 20K often classifies REST. `eveOfLongRun` detects
 *     tomorrow's long session and `applyEveFuelFloor` lifts a REST/EASY
 *     tier to MODERATE so the fat→carb shift starts a day early (the
 *     same Pro gate as every macro move, applied by the caller).
 *
 *  2. IN-SESSION FUELING GUIDANCE. For sessions past ~75 minutes, the
 *     standard sports-nutrition carbs-per-hour guidance, as one line on
 *     the session surfaces (day sheet, race-day plan card).
 *
 * Register rules: consensus numbers cited as standard guidance — no
 * products, no supplement talk, no personalisation claims, and the
 * race-day line always says to practise fueling in training first.
 *
 * Pure: no React, no Firestore, no clock reads.
 */
import { RUN_TEMPLATES } from "./workoutTemplates";
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";
import type { ProgramState } from "@/features/program/programTypes";
import type { DayIntensity } from "./dayIntensity";

/** Sessions at/over this planned duration earn the fueling line. */
export const FUELING_MIN_MINUTES = 75;
/** Threshold where the guidance steps up to the long-race rates. */
export const FUELING_LONG_MINUTES = 150;

/** One consensus line for a session of `durationMin` planned minutes.
 *  Null under the threshold — short sessions need no fueling talk. */
export function sessionFuelingLine(
  durationMin: number | null | undefined
): string | null {
  if (!durationMin || durationMin < FUELING_MIN_MINUTES) return null;
  if (durationMin < FUELING_LONG_MINUTES) {
    return "Past ~75 minutes, standard sports-nutrition guidance is 30–60g of carbs per hour. Practise it on training runs — never for the first time on race day.";
  }
  return "For efforts past ~2½ hours, standard guidance steps up to 60–90g of carbs per hour — but only at rates you've practised on training runs.";
}

export interface EveOfLongRun {
  /** "Long 20K" — for the Food hero annotation / any surface copy. */
  templateName: string;
  estimatedDuration: number;
}

/**
 * Tomorrow's scheduled LONG run, when it's big enough to fuel for today
 * (≥ FUELING_MIN_MINUTES planned). Resolution mirrors the rest of the
 * codebase: userOverride wins over templateId; matching is by local date
 * key on the v2 runDays. Null when tomorrow holds no such session —
 * tempo/intervals don't earn an eve (consensus pre-fueling is a long-run
 * practice), and short long runs don't either.
 */
export function eveOfLongRun(
  todayKey: string,
  program: ProgramState | null | undefined
): EveOfLongRun | null {
  if (!program?.runDays?.length) return null;
  const today = parseLocalDate(todayKey);
  if (!today || Number.isNaN(today.getTime())) return null;
  const tomorrowKey = localDateString(addLocalDays(today, 1));
  const runDay = program.runDays.find((rd) => rd.date === tomorrowKey);
  if (!runDay) return null;
  const resolvedId = runDay.userOverride ?? runDay.templateId;
  const tmpl = RUN_TEMPLATES.find((t) => t.id === resolvedId);
  if (!tmpl || tmpl.type !== "long") return null;
  if (tmpl.estimatedDuration < FUELING_MIN_MINUTES) return null;
  return {
    templateName: tmpl.name,
    estimatedDuration: tmpl.estimatedDuration,
  };
}

/**
 * The eve-of-long-run macro floor: a REST/EASY day before a long run
 * lifts to MODERATE so carbs start filling glycogen a day early. A day
 * that's already MODERATE/HARD keeps its own tier — its own training
 * demands at least as much fuel.
 */
export function applyEveFuelFloor(
  tier: DayIntensity,
  eve: EveOfLongRun | null
): DayIntensity {
  if (!eve) return tier;
  return tier === "REST" || tier === "EASY" ? "MODERATE" : tier;
}
