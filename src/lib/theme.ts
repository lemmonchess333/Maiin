// Dark mode colour system — used as enhancement for dark mode toggle
// Accent colours are used in both light and dark themes
export const THEME = {
  // Dark mode backgrounds — warm neutrals, not cold blue-black
  bg: "#121214",
  surface: "#1A1A1F",
  elevated: "#242429",

  // Accent colours (sport-specific — desaturated for calm dark mode)
  running: "#D4637A",
  runningLight: "#E08A9B",
  lifting: "#7B72E9",
  liftingLight: "#9590E0",
  brand: "#7B72E9",
  brandLight: "#9590E0",
  /* Amber — warning banners (Run7 Q10). Distinct from `warning` /
     `semantic.nutrition` (#D9884E) which is the warm orange used for
     food/calorie/macro context. Amber here is a Tailwind amber-600
     base with an amber-500 step for dark-mode visibility (per the
     12–15% tint floor in Q10). Only applied to severity = warning
     banner surfaces + icons; do not use as a CTA fill. */
  amber: "#D97706",
  amberLight: "#F59E0B",
  /* Darker brand step for filled primary CTAs (Join, Follow, Invite,
     post-confirm pills). Use when text sits *on* the colour — the
     lighter `brand` is borderline for WCAG AA on white text at 14–15px.
     Tints (`${THEME.brand}14`) keep using `brand`. */
  brandStrong: "#6560C8",

  // Semantic — harmonised hues, calmer saturation
  semantic: {
    activity: "#7B72E9", // purple — weight, brand, lifting
    hydration: "#52A3BD", // teal — water
    vitals: "#D4637A", // coral — health, heart rate, recovery
    nutrition: "#D9884E", // warm orange — food, calories, macros
    positive: "#4DB872", // green — positive states (streak, PR)
    negative: "#D4637A", // shares coral — negative states, alerts
  },

  // Food-specific action colour — used by the Scan CTA on the Food page.
  // Distinct from semantic.nutrition (which stays warm orange for macro
  // context) because the scan CTA needs a saturated coral-red that
  // harmonises with the calorie ring above it.
  food: {
    scan: "#FF6B4A",
    scanLight: "#FF7D5F", // +8% lightness in HSL for gradient top stop
  },

  // Legacy semantic (kept for compatibility)
  success: "#4DB872",
  warning: "#D9884E",
  danger: "#D4637A",
  teal: "#52A3BD",

  // Text — softer contrast, not harsh white
  textPrimary: "#E0E0E5",
  textSecondary: "rgba(255,255,255,0.60)",
  textMuted: "rgba(255,255,255,0.22)",

  // Light mode text helpers
  text: {
    muted: "#8E8E93", // iOS system grey
  },

  // Neutral backgrounds
  neutral: {
    50: "#FAFAFA",
    100: "#F2F2F7", // iOS system grouped background
    200: "#E5E5EA",
    300: "#D1D5DB", // gray-300 — disabled / empty-state grey
  },

  // Achievement / rank tier metallics. Single source for
  // bronze/silver/gold/platinum medals so the former hardcoded copies
  // (badges TIER_COLORS, challenges TIER_COLORS, ChallengeList rank chips)
  // no longer drift out of sync.
  tier: {
    bronze: "#CD7F32",
    silver: "#C0C0C0",
    gold: "#FFD700",
    platinum: "#E5E4E2",
  },

  // Calendar dot colours — only TWO, ever
  calendar: {
    liftDay: "#7B72E9", // purple dot = lift day (matches lifting)
    runDay: "#D4637A", // coral dot = run day (matches running)
  },

  // Unified icon background
  iconBg: "rgba(123, 114, 233, 0.10)", // brand tint — subtle

  // Macro colours — iconic food per macro:
  //   protein = meat-pink (Beef), carbs = wheat-gold (Wheat),
  //   fat = avocado-sage (Avocado). Each tile pairs colour + silhouette
  //   of the food it stands for. Sage fat is deliberately muted vs the
  //   punchy success green (#4DB872) so the two never collide as signals.
  //
  //   These values are tuned for dark mode and for accents/tints/dots.
  //   For text on a light card, pair with `MACROS_TEXT_LIGHT` (see below)
  //   via the `useMacroPalette()` hook — the raw values fail WCAG AA
  //   contrast on white (#EAB308 ≈ 1.95:1).
  macros: {
    calories: "#EF4444", // Tailwind red-500
    protein: "#EC4899", // Tailwind pink-500
    carbs: "#EAB308", // Tailwind yellow-500
    fat: "#7CB46C", // sage avocado
  },

  // Charts
  chartGrid: "rgba(255,255,255,0.05)",
  chartTooltipBg: "#242429",

  // Pace colours (for splits — used in both themes)
  paceFast: "#4DB872",
  paceOnTarget: "#7B72E9",
  paceSlow: "#D4637A",
  // Gradient helpers — subtler transitions
  gradient: {
    brand: "linear-gradient(135deg, #9590E0, #7B72E9)",
    brandCta: "linear-gradient(135deg, #7B72E9, #52A3BD)",
  },
} as const;

export type MacroKey = keyof typeof THEME.macros;

/**
 * Darker macro colours intended for text rendered on a light card surface.
 *
 * Paired with `THEME.macros.*` via `useMacroPalette()` — that hook returns
 * the bright palette in dark mode and these darker values in light mode so
 * macro tiles keep their semantic colour coding while clearing WCAG AA
 * contrast (4.5:1 for body text) on white. All values measured against
 * pure white are ≥ 4.85:1.
 *
 *   protein  #BE185D  pink-700   ~6.1:1
 *   carbs    #A16207  yellow-700 ~4.95:1
 *   fat      #4F7D43  deep sage  ~4.86:1
 *   nutrition #B45309 amber-700  ~4.95:1
 */
export const MACROS_TEXT_LIGHT = {
  protein: "#BE185D",
  carbs: "#A16207",
  fat: "#4F7D43",
  nutrition: "#B45309",
} as const;

/** Over-target colour: amber for modest overshoot (≤15%), deep red for substantial. */
// Deliberately removed — previously ramped numbers/bars on the Food hero
// from amber to deep red when over target. Going over isn't a failure
// state; the UI now simply keeps the base macro/ring colour and lets the
// overshoot speak for itself via the "over" label and the tertiary value.
