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
  /** HYBRID-GUIDANCE-01: a display TONE for the caller's accent colour —
   *  NOT a physical-readiness claim. Renamed from `readiness` because it
   *  drives colour, not a measured recovery state (Tropos doesn't measure
   *  sleep, HRV, or physical freshness). */
  tone: "fresh" | "steady" | "ease";
  /** Cross-discipline guidance sentence. */
  line: string;
  /** Why today's macros lean the way they do (narrates, never changes). */
  fuelLine: string;
}

/**
 * Shared "demanding run" predicate — long distance, long duration, or a
 * quality template. One definition so the Home guidance hook and the
 * Easier-today recommendation (easierToday.ts) can never drift apart.
 * Pure + deterministic.
 */
export const QUALITY_RUN_TYPES: ReadonlySet<string> = new Set([
  "tempo",
  "intervals",
  "long",
]);

export function isHardRun(run: {
  distance: number;
  duration: number;
  activityType?: string;
}): boolean {
  return (
    run.distance >= 8000 ||
    run.duration >= 2700 ||
    (run.activityType !== undefined && QUALITY_RUN_TYPES.has(run.activityType))
  );
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
      tone: "fresh",
      line: "Rest day — let yesterday's training settle in.",
      fuelLine,
    };
  }

  // Combined demand FIRST: with both disciplines hard yesterday, the
  // combined line always wins. This branch used to sit BELOW the two
  // single-discipline checks, which together cover every non-rest
  // todayType when both flags are true — making it unreachable dead
  // code (the "Two hard sessions" line could never render).
  if (y.hardLift && y.hardRun) {
    return {
      tone: "ease",
      line: "Two hard sessions yesterday — ease in or keep it short.",
      fuelLine,
    };
  }
  // Cross-discipline interference: a hard session yesterday in the OTHER
  // discipline you're about to train today.
  if (y.hardLift && (todayType === "run" || todayType === "both")) {
    return {
      tone: "ease",
      line: "Hard lift yesterday — keep today's run easy.",
      fuelLine,
    };
  }
  if (y.hardRun && (todayType === "lift" || todayType === "both")) {
    return {
      tone: "ease",
      line: "Long run yesterday — legs may feel heavy under the bar.",
      fuelLine,
    };
  }

  // HYBRID-GUIDANCE-01: nothing logged yesterday is the ABSENCE of data,
  // not proof of freshness — the user may have trained off-app or be
  // tired. Stay neutral (steady tone) and defer to how they feel rather
  // than claiming "Fresh legs".
  if (!y.anyLift && !y.anyRun) {
    return {
      tone: "steady",
      line: "Nothing logged yesterday — train to how you feel.",
      fuelLine,
    };
  }

  return {
    tone: "steady",
    line: "Yesterday's work is in the bank — train steady today.",
    fuelLine,
  };
}
