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
  /* Amber — the WARNING family (Run7 Q10; D19 made `warning` its alias
     on 2026-08-22, so the two are one value now). Tailwind amber-600
     base with an amber-500 step for dark-mode visibility. Severity =
     warning surfaces + icons only; never a CTA fill, and never for
     food/calorie context — that is `semantic.nutrition` (#D9884E). */
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

  /* Semantic aliases. `warning` was #D9884E — byte-identical to
     semantic.nutrition — for its whole life, which meant CLAUDE.md's
     warning-register rule bought nothing visual: every warning rendered
     in the food colour (D19). Split 2026-08-22 (owner-delegated): warning
     IS the amber family now, same value as THEME.amber, matching the CSS
     ramp that was already amber (--warning light ≈ amber-700, dark =
     amber-500). Fill/icon use only; TEXT takes hsl(var(--warning-strong)).
     `success`/`danger` remain value-aliases of semantic.positive/vitals —
     pixel-correct, name-only debt, pinned in colorCanonical.test.ts. */
  success: "#4DB872",
  warning: "#D97706",
  danger: "#D4637A",
  teal: "#52A3BD",

  // Text — softer contrast, not harsh white
  textPrimary: "#E0E0E5",
  textSecondary: "rgba(255,255,255,0.60)",
  textMuted: "rgba(255,255,255,0.22)",

  /* Photo scrim — legibility gradient stops for text overlaid on
     editorial photography (Social uplift v3). Theme-INDEPENDENT by
     design: text on a photo reads white-over-dark-scrim in both
     light and dark mode (the photo, not the theme, is the surface). */
  scrim: "rgba(0,0,0,0.55)",
  scrimSoft: "rgba(0,0,0,0.15)",

  // Light mode text helpers
  /* `text.muted` (#8E8E93) was deleted in the 2026-08-22 owner-decided
     consolidation: it was a FIXED grey serving both themes, measuring
     2.53–3.26:1 across the light surfaces it actually rendered on and
     failing dark's muted tiles too. The muted-text identity is the
     theme-aware `--muted-foreground` token — `text-muted-foreground` in
     className contexts, `"hsl(var(--muted-foreground))"` in style/JS
     contexts. Do not reintroduce a JS hex for secondary text; the one
     legitimate literal left is `runLiveActivity.ts` (native plugin,
     always-dark overlay, no CSS vars). */

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

  // Calorie-ring arc gradient stops — purpose-built purple shades around
  // the brand: `light` sits above brandLight (#9590E0), `deep` below
  // brandStrong (#6560C8) for the overshoot arc. Named here (Food7) so
  // the Food hero's focal colour isn't a stray hex in CalorieRing.tsx.
  calorieRing: {
    light: "#A8A2EF", // lighter stop for the arc gradient
    deep: "#5D55C9", // deeper stop for the overshoot arc
    /* The mode chip's LIGHT backing: iconBg (10% brand tint) flattened
       onto white — 0.9*255 + 0.1*(123,114,233) = rgb(242,241,253).
       Identical rendered colour to the translucent tint on the plain
       white card, but OPAQUE, so over the hero photo the chip keeps a
       designed surface instead of going sheer (the #1728 failure mode,
       light-side). */
    chipBgLight: "#F2F1FD",
  },

  // Swipe-action colours (FoodRow). Deliberate iOS-HIG system tones —
  // chosen over the previous #EF4444 / slate #4B5563 pair because they
  // sit better against the warm light surfaces. Tokenised here (Food7)
  // without changing the values; transient (swipe only), so not part of
  // the resting-viewport palette.
  swipe: {
    destructive: "#FF3B30", // iOS system red — delete
    neutral: "#48484A", // neutral dark grey — edit
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
 * Medal colours for leaderboard ranks 1/2/3 (gold/silver/bronze), derived
 * from the canonical `THEME.tier` set. The single source for the rank chips
 * across LeaderboardCard, FullLeaderboard, and the challenge leaderboard —
 * index by `rank - 1`.
 */
export const RANK_COLORS = [
  THEME.tier.gold,
  THEME.tier.silver,
  THEME.tier.bronze,
] as const;

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
