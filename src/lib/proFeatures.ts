/**
 * Pro feature registry — typed source of truth for paywall lookups.
 *
 * Pre-unification paywall callsites passed display labels like
 * "Adaptive TDEE" straight through to ProModal as a hero key.
 * ProModal's FEATURE_HEROES map was keyed on `performance` /
 * `ai_coaching` / `food_logging`, so the display strings never
 * matched and the feature-specific hero never rendered. Worse: any
 * typo at a callsite silently fell through to the generic hero.
 *
 * `ProFeatureKey` is now a closed TypeScript union — the gating
 * surfaces (currently `ProModal` + ad-hoc `useSubscription().isPro`
 * checks across Home / Program / Food / Upgrade) all share the same
 * key shape, so the compiler catches drift before runtime.
 *
 * `label` is the short noun used inline ("AI food photo logging").
 * `title` is the modal hero heading ("Unlock AI food logging").
 * `tagline` is the supporting copy under the title.
 * `sourceLabel` is the analytics dimension — emitted with the
 * paywall_viewed event so we can see which gates drive interest.
 *
 * Sub2 — Pro scope shrinkage (locked in /grill-me). The Pro
 * registry narrows from 6 keys to 4: `performance_engine` and
 * `advanced_insights` removed. Performance Index, plateau
 * detection, and the broader "performance insights" surface are
 * now free for everyone (P2 made PI a Home-card hero; gating it
 * was hiding Tropos's whole adaptive positioning from free users).
 * Pro now gates only AI-augmented + adaptive-optimisation features.
 */

export type ProFeatureKey =
  | "ai_food_logging"
  | "ai_coaching"
  | "adaptive_macros"
  | "adaptive_tdee";

export interface ProFeatureConfig {
  key: ProFeatureKey;
  /** Short noun for inline use ("Performance Engine"). */
  label: string;
  /** Modal hero heading ("Unlock Performance Engine"). */
  title: string;
  /** Supporting copy in the modal hero. */
  tagline: string;
  /** Stable analytics dimension. */
  sourceLabel: string;
}

export const PRO_FEATURES: Record<ProFeatureKey, ProFeatureConfig> = {
  ai_food_logging: {
    key: "ai_food_logging",
    label: "AI food photo logging",
    title: "Unlock AI food logging",
    tagline: "Log meals from a photo. No manual searching.",
    sourceLabel: "ai_food_logging",
  },
  ai_coaching: {
    key: "ai_coaching",
    label: "AI Coaching Insights",
    title: "Unlock AI Coaching",
    tagline: "Personalised recommendations based on your training data.",
    sourceLabel: "ai_coaching",
  },
  adaptive_macros: {
    key: "adaptive_macros",
    label: "Adaptive macros",
    title: "Unlock Adaptive Macros",
    tagline: "Adjust macro targets around your bodyweight and activity.",
    sourceLabel: "adaptive_macros",
  },
  adaptive_tdee: {
    key: "adaptive_tdee",
    label: "Adaptive TDEE",
    title: "Unlock Adaptive TDEE",
    tagline: "Adjust calorie targets using your real weight and intake trends.",
    sourceLabel: "adaptive_tdee",
  },
};

/** Lookup helper. Returns null for an undefined key so callers can
 *  fall through to the generic hero without a try/catch. */
export function getProFeature(key?: ProFeatureKey): ProFeatureConfig | null {
  return key ? (PRO_FEATURES[key] ?? null) : null;
}
