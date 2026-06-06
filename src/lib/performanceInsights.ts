/**
 * performanceInsights — deterministic per-sub-score narrative
 * generation for the Performance Index surface (locked P2b).
 *
 * On-device, template-based, privacy-preserving. No Gemini calls
 * (P2 cross-cut: AI generation would send training data off-device
 * AND cost per weekly rollup). Templates are PR-reviewed constants,
 * stress-tested in unit tests so the tone stays observational +
 * actionable + never judgmental.
 *
 * Selection is deterministic from `(uid + weekKey + subScore + band)`
 * so the same week always shows the same insight on re-views, but
 * different weeks rotate naturally through the 3-5 variants per band.
 *
 * Score bands (P2b pin 10):
 *   low    [0-39]
 *   medium [40-69]
 *   high   [70-100]
 * Inclusive boundaries, consistent across load / recovery / adherence.
 *
 * Special cases (in priority order — first match wins):
 *   1. <4 weeks of data    → baseline-establishing copy
 *   2. deload week         → keyed on loadBand === 'deload'
 *   3. PI delta < -10      → diagnostic insight (P2d pin 8)
 *   4. otherwise           → lowest-sub-score band-keyed insight
 */

export type SubScore = "load" | "recovery" | "adherence";
export type ScoreBand = "low" | "medium" | "high";

export interface PerformanceInsight {
  /** Headline — 1-line, sentence case, no period. */
  headline: string;
  /** Body — 1-2 sentences, observational + actionable, no judgment. */
  body: string;
  /** Which sub-score (or special case) drove the selection. */
  source: SubScore | "baseline" | "deload" | "decline";
}

export function scoreBand(score: number): ScoreBand {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

interface InsightInput {
  uid: string;
  weekKey: string;
  loadScore: number;
  recoveryScore: number;
  adherenceScore: number;
  /** Total weeks of performance data available (including this one). */
  weeksAvailable: number;
  /** PI delta vs prior week. null on the first week. */
  delta: number | null;
  /** Programme's load band classifier — "deload" triggers the
   *  recovery-week-specific copy. */
  loadBand?: string;
}

/* -------------------------------------------------------------- *
 *  Templates                                                     *
 * -------------------------------------------------------------- *
 *
 *  Style guide for future contributors:
 *    - Observational, not judgmental: "Load is high" ✓,
 *      "You're crushing it!" ✗
 *    - Actionable: pair an observation with what to consider next
 *      ("ease tempo work this week").
 *    - No exclamation marks. Calm voice.
 *    - 1-2 sentences max. Compact tile constraint.
 */

const LOAD_TEMPLATES: Record<ScoreBand, PerformanceInsight[]> = {
  low: [
    {
      source: "load",
      headline: "Load is light",
      body: "You logged fewer sessions than your usual week. Add one easy session if you're feeling fresh.",
    },
    {
      source: "load",
      headline: "Light week",
      body: "Training volume dipped. Consistency matters more than peak weeks — pick one workout to anchor next week.",
    },
    {
      source: "load",
      headline: "Quiet week",
      body: "Volume came in low. If you're easing in, ramp gently.",
    },
  ],
  medium: [
    {
      source: "load",
      headline: "Load is balanced",
      body: "Volume sits in your typical range. Keep the current cadence.",
    },
    {
      source: "load",
      headline: "Steady volume",
      body: "Training load is consistent with your recent weeks. Good baseline.",
    },
    {
      source: "load",
      headline: "On rhythm",
      body: "Sessions logged match your usual cadence. No adjustment needed.",
    },
  ],
  high: [
    {
      source: "load",
      headline: "Load is high",
      body: "Volume is elevated this week. Watch how recovery responds before adding more.",
    },
    {
      source: "load",
      headline: "Big week",
      body: "You stacked more sessions than usual. Prioritise sleep + protein the next few days.",
    },
    {
      source: "load",
      headline: "Heavy training",
      body: "Load is up. Resist the urge to push further if recovery is trending down.",
    },
  ],
};

const RECOVERY_TEMPLATES: Record<ScoreBand, PerformanceInsight[]> = {
  low: [
    {
      source: "recovery",
      headline: "Recovery is short",
      body: "Sleep or rest days came in low. Consider an extra easy day this week.",
    },
    {
      source: "recovery",
      headline: "Recovery low",
      body: "Recovery signals are below your usual baseline. Sleep is the highest-leverage lever.",
    },
    {
      source: "recovery",
      headline: "Recovery dipped",
      body: "You're recovering less than your training load asks for. Pull one session if it persists.",
    },
  ],
  medium: [
    {
      source: "recovery",
      headline: "Recovery looks okay",
      body: "Rest and sleep are in your normal range. Maintain.",
    },
    {
      source: "recovery",
      headline: "Steady recovery",
      body: "Recovery signals are stable. No changes needed.",
    },
    {
      source: "recovery",
      headline: "On track",
      body: "Sleep + rest cadence is consistent with your training load.",
    },
  ],
  high: [
    {
      source: "recovery",
      headline: "Well-recovered",
      body: "Recovery is strong relative to your load. Good week to add a quality session if you want.",
    },
    {
      source: "recovery",
      headline: "Recovery is high",
      body: "You're absorbing the load well. Keep building gradually.",
    },
    {
      source: "recovery",
      headline: "Fresh",
      body: "Recovery signals are healthy. You have room to push if a goal calls for it.",
    },
  ],
};

const ADHERENCE_TEMPLATES: Record<ScoreBand, PerformanceInsight[]> = {
  low: [
    {
      source: "adherence",
      headline: "Below plan",
      body: "Most sessions ran off-plan. Reset next week with one anchor.",
    },
    {
      source: "adherence",
      headline: "Below plan",
      body: "Adherence came in below your usual. Pick one session to anchor and skip the rest if needed.",
    },
    {
      source: "adherence",
      headline: "Lighter than planned",
      body: "Several sessions moved or dropped. If next week looks similar, trim the plan to fit.",
    },
  ],
  medium: [
    {
      source: "adherence",
      headline: "Mostly on plan",
      body: "You followed the plan more often than not. Small swaps are normal.",
    },
    {
      source: "adherence",
      headline: "Plan + life",
      body: "Adherence is reasonable for a real-life week. Keep going.",
    },
    {
      source: "adherence",
      headline: "Solid follow-through",
      body: "Most scheduled sessions happened; a few slipped, which is normal.",
    },
  ],
  high: [
    {
      source: "adherence",
      headline: "On plan",
      body: "Sessions matched the plan closely this week. Consistency compounds.",
    },
    {
      source: "adherence",
      headline: "Disciplined week",
      body: "Adherence is high. The plan is doing its job — trust it.",
    },
    {
      source: "adherence",
      headline: "Plan executed",
      body: "You ran the plan as written. The next adaptation comes from staying the course.",
    },
  ],
};

const BASELINE_TEMPLATES: PerformanceInsight[] = [
  {
    source: "baseline",
    headline: "Baseline forming",
    body: "Your Performance Index needs a few weeks of data to spot trends. Keep logging.",
  },
  {
    source: "baseline",
    headline: "Early days",
    body: "First weeks are about establishing a baseline. Numbers stabilise after ~4 weeks.",
  },
];

const DELOAD_TEMPLATES: PerformanceInsight[] = [
  {
    source: "deload",
    headline: "Deload week",
    body: "Load is intentionally lower this week. Recovery metrics should rebound.",
  },
  {
    source: "deload",
    headline: "Recovery phase",
    body: "This is a planned step back. Use it — easy sessions + sleep are the work.",
  },
];

const DECLINE_TEMPLATES: PerformanceInsight[] = [
  {
    source: "decline",
    headline: "Index down sharply",
    body: "Performance Index fell more than 10 points. Check load + recovery scores for the cause.",
  },
  {
    source: "decline",
    headline: "Down from last week",
    body: "A double-digit drop usually means recovery or adherence took a hit. Open Analytics to see which.",
  },
];

/** Fast 32-bit non-crypto hash. Deterministic across runs; collision
 *  rate doesn't matter for a 3-5-element selection. */
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function selectVariant<T>(
  uid: string,
  weekKey: string,
  salt: string,
  variants: T[]
): T {
  if (variants.length === 0)
    throw new Error("selectVariant: empty variants array");
  const idx = hashString(`${uid}:${weekKey}:${salt}`) % variants.length;
  return variants[idx];
}

/**
 * Build the Home / compact-surface insight for a given week.
 *
 * Priority order:
 *   1. <4 weeks of data           → baseline copy
 *   2. loadBand === 'deload'      → deload copy
 *   3. delta < -10                → decline diagnostic
 *   4. lowest sub-score's band    → that sub-score's template
 *
 * The lowest-sub-score rule surfaces the metric most needing
 * attention. Ties are broken in load → recovery → adherence order
 * to keep selection deterministic.
 */
export function buildPerformanceInsight(
  input: InsightInput
): PerformanceInsight {
  const {
    uid,
    weekKey,
    loadScore,
    recoveryScore,
    adherenceScore,
    weeksAvailable,
    delta,
    loadBand,
  } = input;

  if (weeksAvailable < 4) {
    return selectVariant(uid, weekKey, "baseline", BASELINE_TEMPLATES);
  }
  if (loadBand === "deload") {
    return selectVariant(uid, weekKey, "deload", DELOAD_TEMPLATES);
  }
  if (delta !== null && delta < -10) {
    return selectVariant(uid, weekKey, "decline", DECLINE_TEMPLATES);
  }

  // Lowest sub-score wins. Ties → load → recovery → adherence.
  const scores: { sub: SubScore; value: number }[] = [
    { sub: "load", value: loadScore },
    { sub: "recovery", value: recoveryScore },
    { sub: "adherence", value: adherenceScore },
  ];
  scores.sort((a, b) => a.value - b.value);
  const lowest = scores[0];
  const band = scoreBand(lowest.value);

  const variants =
    lowest.sub === "load"
      ? LOAD_TEMPLATES[band]
      : lowest.sub === "recovery"
        ? RECOVERY_TEMPLATES[band]
        : ADHERENCE_TEMPLATES[band];

  return selectVariant(uid, weekKey, `${lowest.sub}:${band}`, variants);
}
