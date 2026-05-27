/**
 * Daily glance-line builder for the Food page hero.
 *
 * Produces a single sentence that answers "how am I doing today" at
 * a glance — protein-priority for hybrid/lifting users, neutral
 * over-target language (no shame red), tiny-deficit guard so the
 * copy doesn't nag at "Still need 3g protein", and a soft empty
 * state ("Ready when you are") so an unlogged morning isn't framed
 * as a 1900-cal deficit.
 *
 * Pure function; called from FoodHeroCard. Returns string or null
 * (null = render nothing — only happens for genuinely malformed
 * targets or missing data we can't reason about).
 *
 * Priority rules (first match wins):
 *   1. nothing logged → "Ready when you are"
 *   2. targets are default (user hasn't set personal targets) →
 *      "Set targets to personalise your day"
 *   3. protein meaningfully short (>=10g) → leads with protein,
 *      pairs with calorie clause when calories are also off-track
 *   4. protein hit + calories meaningfully over (>150) →
 *      calorie-over led
 *   5. protein hit + calories meaningfully under (>150) →
 *      "Protein hit · N cal left"
 *   6. otherwise → "On track for today"
 *
 * Carbs/fat are intentionally omitted from F3 — protein and
 * calories cover the daily-glance signal for hybrid/lifting users
 * without dragging tiny carb/fat deficits into nagging copy.
 */

export interface DailyTotalsForGlance {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DailyTargetsForGlance {
  /** Calorie target after day-type adjustment (effectiveBonus). */
  finalTarget: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface BuildGlanceOpts {
  /** True when the user hasn't set personal targets (profile
   *  fallbacks of 2200 cal / 160-250-60 macros are in use).
   *  Drives the "Set targets to personalise your day" copy. */
  targetsAreDefault?: boolean;
}

/** Protein deficit below which we treat the macro as broadly hit
 *  rather than nagging about the last few grams. */
const PROTEIN_MEANINGFUL_DEFICIT_G = 10;

/** Calorie over-/under-target band for "on track" copy.
 *  Outside this band we surface the calorie clause; inside,
 *  protein hit + calories silent → "On track for today". */
const CALORIES_OFF_TRACK_BAND = 150;

function isFiniteNonNegative(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

export function buildGlanceLine(
  totals: DailyTotalsForGlance,
  targets: DailyTargetsForGlance,
  opts: BuildGlanceOpts = {}
): string | null {
  /* Defensive: a corrupt or malformed target makes every branch
     produce nonsense. Render nothing rather than "NaN cal left". */
  if (!isFiniteNonNegative(targets.finalTarget) || targets.finalTarget === 0) {
    return opts.targetsAreDefault
      ? "Set targets to personalise your day"
      : null;
  }
  if (!isFiniteNonNegative(targets.protein)) {
    return null;
  }

  const consumedCal = isFiniteNonNegative(totals.calories)
    ? totals.calories
    : 0;
  const consumedPro = isFiniteNonNegative(totals.protein) ? totals.protein : 0;
  const consumedCarbs = isFiniteNonNegative(totals.carbs) ? totals.carbs : 0;
  const consumedFat = isFiniteNonNegative(totals.fat) ? totals.fat : 0;

  const nothingLogged =
    consumedCal === 0 &&
    consumedPro === 0 &&
    consumedCarbs === 0 &&
    consumedFat === 0;

  if (nothingLogged) {
    return opts.targetsAreDefault
      ? "Set targets to personalise your day"
      : "Ready when you are";
  }

  /* Personal targets not set — even with food logged, we can't say
     anything meaningful about adherence to defaults the user
     never confirmed. Surface the gear-icon-driven action copy. */
  if (opts.targetsAreDefault) {
    return "Set targets to personalise your day";
  }

  const calDelta = targets.finalTarget - consumedCal; // + = under, − = over
  const proDelta = targets.protein - consumedPro; // + = need more

  const calLeft = Math.round(Math.max(0, calDelta));
  const calOver = Math.round(Math.max(0, -calDelta));
  const proteinNeeded = Math.round(Math.max(0, proDelta));

  const proteinShort = proDelta >= PROTEIN_MEANINGFUL_DEFICIT_G;
  const caloriesMeaningfullyUnder = calLeft > CALORIES_OFF_TRACK_BAND;
  const caloriesMeaningfullyOver = calOver > CALORIES_OFF_TRACK_BAND;

  if (proteinShort) {
    /* "left" reads more naturally with an over-cal clause; "Still
       need" reads more naturally when both protein and calories
       are under. The visual difference between the two is small
       but the wording distinction matches how a coach would say
       it aloud. */
    if (caloriesMeaningfullyOver) {
      return `${proteinNeeded}g protein left · ${calOver} cal over`;
    }
    if (caloriesMeaningfullyUnder) {
      return `Still need ${proteinNeeded}g protein · ${calLeft} cal left`;
    }
    return `Still need ${proteinNeeded}g protein`;
  }

  /* Protein hit (or within the tiny-deficit guard). Calorie clause
     leads when calories are off — protein gets the trailing
     "Protein hit" affirmation. */
  if (caloriesMeaningfullyOver) {
    return `${calOver} cal over · Protein hit`;
  }
  if (caloriesMeaningfullyUnder) {
    return `Protein hit · ${calLeft} cal left`;
  }
  return "On track for today";
}
