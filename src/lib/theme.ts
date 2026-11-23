// Dark mode colour system — used as enhancement for dark mode toggle
// Accent colours are used in both light and dark themes
export const THEME = {
  // Dark mode backgrounds — the DS3 neutrals, mirroring `.dark` in
  // index.css (page, card, raised). The run surfaces paint these directly
  // because they are always dark, whatever the app theme.
  bg: "#0E0E11",
  surface: "#17171B",
  elevated: "#212127",

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
  /* The brand purple's ramp, step for step the `--ds-purple-*` hexes in
     tokens.css (pinned by colorCanonical.test.ts), for the places a colour
     has to be a JS value: an SVG gradient stop, a canvas. 400, 500 and 600
     are brandLight, brand and brandStrong. The streak flame's tiers are
     built from it. */
  purpleRamp: {
    50: "#F5F4FE",
    100: "#ECEAFE",
    200: "#D9D5FA",
    400: "#9590E0",
    500: "#7B72E9",
    600: "#6560C8",
    700: "#4E4AA8",
  },

  // Semantic — harmonised hues, calmer saturation
  semantic: {
    activity: "#7B72E9", // purple — lifting
    hydration: "#52A3BD", // teal — water
    vitals: "#D4637A", // coral — running (heart rate has its own scale, ending in `hrZoneMax`)
    nutrition: "#D9884E", // warm orange — food, calories, macros
    positive: "#4DB872", // green — a done state, beside its tick
    negative: "#EF4444", // red — errors and destructive actions (DS10 call 2)
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
     `success` is a value-alias of semantic.positive, pinned in
     colorCanonical.test.ts. `danger` is the error red, the dark theme's
     `--destructive` to a channel, and `semantic.negative` with it. Coral
     means running only (DS10 call 2): an error is red with its icon, and
     slow and behind are neutral with their chevron or word. */
  success: "#4DB872",
  warning: "#D97706",
  danger: "#EF4444",
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

  /* The chrome's colours for inline styles (DS10 call 1): an icon, a
     tint or a line that is not the person's
     data is neutral, so purple means lifting and the brand lives in the
     mark and the art. `text` and `tint` follow the theme through the
     tokens; `grey` is the one literal, for what cannot read a CSS
     variable (a map's paint, a canvas). */
  chrome: {
    text: "hsl(var(--foreground))",
    muted: "hsl(var(--muted-foreground))",
    tint: "hsl(var(--foreground) / 0.08)",
    grey: "#A1A1AA",
    /* The text colour as a literal, per theme: a line on a map. */
    line: { dark: "#F4F4F6", light: "#0E0E11" },
  },

  // Unified icon background: the chrome's tint (DS10 call 1).
  iconBg: "hsl(var(--foreground) / 0.08)",

  /* Macro colours, the dark theme's (DS10 call 3): protein orchid, carbs
     wheat-gold, fat jade, each beside its Beef, Wheat or Avocado. Picked
     by measurement (CIEDE2000, Machado 2009 at severity 100):

       protein #EC8AF5  20 or more from the ring, carbs, fat, coral,
                        water and lifting purple in normal vision (22 the
                        closest, purple); 47 from the ring, 53 from carbs
                        and 26 from fat at deutan and protan 100; 8.1:1 on
                        the dark card.
       fat     #0D907B  21 or more from every one of them in normal
                        vision (21, water); 16 from the ring, 28 from carbs
                        and 26 from protein at deutan and protan 100;
                        4.5:1 on the dark card.

     `macroPalette.test.ts` measures every pair. The light theme fills and
     writes them in `MACROS_LIGHT`, through `useMacroPalette()`: these
     are under 3:1 on white. Carbs is the same in both themes. */
  macros: {
    calories: "#EF4444", // Tailwind red-500
    protein: "#EC8AF5", // orchid
    carbs: "#EAB308", // Tailwind yellow-500
    fat: "#0D907B", // jade
  },

  // The Food calorie ring's shades around the food orange
  // (`semantic.nutrition`, #D9884E). The ring was brand purple until the
  // owner's Food call of 2026-09-28: food is orange on Home's food card,
  // in Analytics and on the rest of this page, and the ring was the one
  // purple thing on it. Named here (Food7) so the Food hero's focal
  // colour isn't a stray hex in CalorieRing.tsx.
  calorieRing: {
    /* The overshoot orange, a fill only: the ring's second lap past the
       target, the week strip's over-target lap and the drill-down bar
       past it. The `--nutrition-strong` light value. */
    deep: "#A34B08",
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

  /* The run's pace, light to dark (DS10 call 2): a fast stretch light
     yellow, the run's own average the amber that data scales keep, a slow
     stretch blue, so no step is the running colour and none is red
     against green. Each neighbouring step is 15 or more apart
     (CIEDE2000) in normal vision and at deuteranopia and protanopia
     severity 100 (Machado 2009); `paceScale.test.ts` measures it. Read by
     the route's colours (`routePace.ts`) and the live run's pace bar
     (`PaceZoneBar`). */
  pace: {
    fast: "#F9D86A",
    average: "#D97706",
    slow: "#2975E0",
  },
  /* Heart-rate zone 5, the hottest step of the zones' scale (teal, green,
     two ambers, then this; RunBottomSheet). A raspberry, so it is
     neither the running coral nor the error red: 17.0 from coral and 26.8
     from #EF4444 in normal vision (CIEDE2000). Against zone 4's amber it
     measures 49.4 normal, 40.7 deutan 100 and 52.4 protan 100 (amber
     against coral measures 18.9 deutan); its nearest other zone is teal,
     11.1 at deutan 100. It is the 10 px dot beside "HR Z5", 3.2:1 on the stats
     pill: under 4.5:1, so the bpm keeps the stat colour. The steps that
     clear 4.5:1 there are violet (lifting's purple), pale, under 15 from
     coral, or under 9.6 from teal under colour blindness. `paceScale.test.ts` holds
     the numbers. */
  hrZoneMax: "#CD1D93",
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
 * on `LeaderboardRow` and the challenge leaderboards: index by `rank - 1`.
 */
export const RANK_COLORS = [
  THEME.tier.gold,
  THEME.tier.silver,
  THEME.tier.bronze,
] as const;

/**
 * The light theme's protein and fat, as fills and as text (DS10 call 3):
 * the dark theme's values are under 3:1 on white. Each keeps 20 or more
 * from every colour it meets in light (the ring #D9884E and its deep
 * step #A34B08, carbs and its text step, coral, both waters, purple) and
 * 15 or more from the ring, carbs and the other macro at deutan and
 * protan 100.
 *
 *   protein  #A21CAF  6.3:1 on white; 22 from purple, 27 from coral
 *   fat      #007058  6.1:1 on white; 22 from the water token, 22 from
 *                     success green; 17 from the ring's deep step at
 *                     protan 100
 *
 * Carbs keeps its yellow as a fill.
 */
export const MACROS_LIGHT = {
  protein: "#A21CAF",
  carbs: "#EAB308",
  fat: "#007058",
} as const;

/**
 * Darker macro colours intended for text rendered on a light card surface.
 *
 * Paired with `THEME.macros.*` via `useMacroPalette()` — that hook returns
 * the bright palette in dark mode and these darker values in light mode so
 * macro tiles keep their semantic colour coding while clearing WCAG AA
 * contrast (4.5:1 for body text) on white. All values measured against
 * pure white are ≥ 4.85:1.
 *
 *   protein  #A21CAF  fuchsia     ~6.3:1 (MACROS_LIGHT, DS10)
 *   carbs    #A16207  yellow-700 ~4.95:1
 *   fat      #007058  deep jade   ~6.1:1 (MACROS_LIGHT, DS10)
 *   nutrition #B45309 amber-700  ~4.95:1
 */
export const MACROS_TEXT_LIGHT = {
  protein: MACROS_LIGHT.protein,
  carbs: "#A16207",
  fat: MACROS_LIGHT.fat,
  nutrition: "#B45309",
} as const;

/** Over-target colour: amber for modest overshoot (≤15%), deep red for substantial. */
// Deliberately removed — previously ramped numbers/bars on the Food hero
// from amber to deep red when over target. Going over isn't a failure
// state; the UI now simply keeps the base macro/ring colour and lets the
// overshoot speak for itself via the "over" label and the tertiary value.
