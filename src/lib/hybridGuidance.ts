/**
 * Hybrid loop — the cross-discipline "today" narrative (the differentiator).
 *
 * Tropos is one app where your run, your lift, and your fuel talk to each
 * other. This makes that loop VISIBLE: it connects what you did yesterday
 * (across disciplines) to what today is and how today is fuelled — WITHOUT
 * changing any numbers. The nutrition model is locked expenditure-inclusive
 * (Nutr1): no eat-back, flat calories, day-type drives the macro split. So
 * `fuelLineFor` only *narrates* the carb-periodisation that already happens.
 *
 * Pure + deterministic (inputs injected) so the matrix is unit-testable in one
 * place — the hook and the test both read this, never a parallel formula.
 */

export type DayType = "lift" | "run" | "both" | "rest";

/** Yesterday's training, reduced to the signals the guidance needs. The hook
 *  derives these from saved workouts + runs (see useHybridGuidance). */
export interface YesterdayTraining {
  anyLift: boolean;
  anyRun: boolean;
  /** A demanding lift (leg/compound focus or long session). */
  hardLift: boolean;
  /** A demanding run (long, or a quality/tempo/interval session). */
  hardRun: boolean;
}

export interface HybridGuidance {
  /** How fresh today is, for the caller's accent colour. */
  readiness: "fresh" | "steady" | "ease";
  /** Cross-discipline readiness sentence. */
  line: string;
  /** Why today's macros lean the way they do (narrates, never changes). */
  fuelLine: string;
}

/** The fuel emphasis for a day type — narration of the locked carb
 *  periodisation, not a calorie/macro change. */
export function fuelLineFor(todayType: DayType): string {
  switch (todayType) {
    case "run":
    case "both":
      return "Carbs run higher today to fuel the work.";
    case "lift":
      return "Protein's the priority on a lift day.";
    case "rest":
      return "Carbs ease back on a rest day.";
  }
}

/**
 * Resolve today's cross-discipline guidance from the day type + yesterday's
 * training. Gentle by design: an "ease" hint only fires on a clear
 * back-to-back demand (hard yesterday in one discipline, a hard day today) —
 * never a guilt nudge.
 */
export function resolveHybridGuidance(
  todayType: DayType,
  y: YesterdayTraining
): HybridGuidance {
  const fuelLine = fuelLineFor(todayType);

  if (todayType === "rest") {
    return {
      readiness: "fresh",
      line: "Rest day — let yesterday's training settle in.",
      fuelLine,
    };
  }

  // Cross-discipline interference: a hard session yesterday in the OTHER
  // discipline you're about to train today.
  if (y.hardLift && (todayType === "run" || todayType === "both")) {
    return {
      readiness: "ease",
      line: "Hard lift yesterday — keep today's run easy.",
      fuelLine,
    };
  }
  if (y.hardRun && (todayType === "lift" || todayType === "both")) {
    return {
      readiness: "ease",
      line: "Long run yesterday — legs may feel heavy under the bar.",
      fuelLine,
    };
  }
  if (y.hardLift && y.hardRun) {
    return {
      readiness: "ease",
      line: "Two hard sessions yesterday — ease in or keep it short.",
      fuelLine,
    };
  }

  // Nothing logged yesterday → fresh.
  if (!y.anyLift && !y.anyRun) {
    return { readiness: "fresh", line: "Fresh legs today.", fuelLine };
  }

  return {
    readiness: "steady",
    line: "Yesterday's work is in the bank — train steady today.",
    fuelLine,
  };
}
