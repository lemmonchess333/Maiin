/* ─────────────────────────────────────────────
   Performance Engine — Types
   Client-side computation for hybrid athletes.
   Structured so extraction to Cloud Functions
   is a copy-paste when the time comes.
   ───────────────────────────────────────────── */

/** Load band emitted by the engine — categorical state derived from PI score. */
export type LoadBand = 'deload' | 'low' | 'moderate' | 'high' | 'overreach';

/**
 * Data-aware signals emitted by the engine on every perf doc write.
 * Drive the client-side `getLine(state, signals)` mapping for the
 * consolidated Performance hero card's supporting copy.
 *
 * All fields have defensive defaults in `normalisePerformanceDoc` —
 * missing fields on legacy docs (pre-PI1a deploy) get neutral values
 * so the line lookup falls through to generic copy for the verb-state.
 */
export interface PerformanceSignals {
  /** Both lift and run loads are strong this week (lls >= 70 && rls >= 70). */
  bothLoadsStrong: boolean;
  /** Lift tonnage ratio above baseline, e.g. 0.18 = 18% above. 0 if not notable (<5%). */
  liftAheadOfBaseline: number;
  /** Run volume ratio above baseline, e.g. 0.20 = 20% above. 0 if not notable (<5%). */
  runAheadOfBaseline: number;
  /** Recovery sub-score below 50. */
  recoveryWeak: boolean;
  /** Adherence sub-score below 50. */
  adherenceWeak: boolean;
  /** Mirrors top-level deloadRecommended for client convenience. */
  deloadFlag: boolean;
  /** Distinct compute-weeks of data the engine has seen for this user. */
  lifetimeWeeks: number;
  /** Days since user's most recent workout or run (whichever is later). */
  daysSinceLastTraining: number;
}

/** Raw weekly aggregates before scoring */
export interface WeeklyAggregates {
  weekKey: string; // "YYYY-MM-DD" (Sunday start)

  // Lifting
  liftTonnage: number;      // sum(weightKg * reps) across all sets
  liftHardSets: number;     // proxy: count of last-set per non-cardio exercise
  liftSessions: number;

  // Running
  runKm: number;            // total km
  runLongKm: number;        // longest single run km
  runQualityCount: number;  // runs with intervalData or tempo/interval activityType
  runSessions: number;

  // Nutrition (may be partial)
  mealDaysLogged: number;   // distinct days with ≥1 meal
  avgDailyCalories: number;
  avgDailyProtein: number;

  // Bodyweight
  bwCurrent7dAvg: number | null;
  bwPrevious7dAvg: number | null;
}

/** Baseline computed from prior weeks */
export interface Baseline {
  liftTonnage: number;
  liftHardSets: number;
  runKm: number;
  runLongKm: number;
  weeksUsed: number; // how many weeks actually had data
}

/** The final performance doc shape */
export interface PerformanceDoc {
  weekKey: string;
  computedAt: string; // ISO date

  // Performance Index (0–100)
  performanceIndex: number;

  // Sub-scores (0–100 each)
  liftLoadScore: number;
  runLoadScore: number;
  recoveryScore: number;
  adherenceScore: number;

  // Multipliers / contextual
  liftProgression: number;      // ratio vs baseline tonnage
  runVolume: number;             // ratio vs baseline km
  runPaceAdjustmentPct: number;  // placeholder until pace tracking matures

  // Meta
  confidence: 'high' | 'medium' | 'low';
  loadBand: LoadBand;
  deloadRecommended: boolean;

  // PI1a: data-aware signals consumed by the consolidated card's
  // client-side getLine(state, signals) mapping. Optional in the
  // type because legacy docs (pre-PI1a deploy) may not have it;
  // defaults filled in by normalisePerformanceDoc.
  signals?: PerformanceSignals;

  // Coach-like insights
  insight: {
    title: string;
    bullets: string[];
  };

  // Plan adjustments (future use)
  planAdjustments: {
    lift: string[];
    run: string[];
  };

  // Raw data for debugging / future server migration
  aggregates: WeeklyAggregates;
  baseline: Baseline;
}

/** Denormalised weekly doc shape used by usePerformanceWeeks hook */
export interface PerformanceWeekDoc {
  weekKey: string;
  performanceIndex: number;

  breakdown: {
    liftLoadScore: number;
    runLoadScore: number;
    recoveryScore: number;
    adherenceScore: number;
  };

  multipliers: {
    liftProgression: number;
    runVolume: number;
    runPaceAdjustmentPct: number;
  };

  aggregates: WeeklyAggregates;

  adherenceScore: number | null;
  loadBand: string;

  labels?: {
    loadBand: string;
  };

  flags?: {
    deloadRecommended: boolean;
  };

  insight?: {
    title: string;
    bullets: string[];
  };

  planAdjustments?: {
    lift: string[];
    run: string[];
  };

  // PI1a: data-aware signals consumed by the consolidated card's
  // client-side getLine(state, signals) mapping. Always populated
  // by normalisePerformanceDoc (defaults applied if missing on
  // legacy docs).
  signals: PerformanceSignals;
}

/** Weights for PI formula */
export const PI_WEIGHTS = {
  load: 0.65,
  recovery: 0.25,
  adherence: 0.10,
  liftInLoad: 0.5,
  runInLoad: 0.5,
} as const;