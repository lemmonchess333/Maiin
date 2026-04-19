// Dark mode colour system — used as enhancement for dark mode toggle
// Accent colours are used in both light and dark themes
export const THEME = {
  // Dark mode backgrounds — warm neutrals, not cold blue-black
  bg: '#121214',
  surface: '#1A1A1F',
  elevated: '#242429',

  // Accent colours (sport-specific — desaturated for calm dark mode)
  running: '#D4637A',
  runningLight: '#E08A9B',
  lifting: '#7B72E9',
  liftingLight: '#9590E0',
  brand: '#7B72E9',
  brandLight: '#9590E0',

  // Semantic — harmonised hues, calmer saturation
  semantic: {
    activity: '#7B72E9',   // purple — weight, brand, lifting
    hydration: '#52A3BD',  // teal — water
    vitals: '#D4637A',     // coral — health, heart rate, recovery
    nutrition: '#D9884E',  // warm orange — food, calories, macros
    positive: '#4DB872',   // green — positive states (streak, PR)
    negative: '#D4637A',   // shares coral — negative states, alerts
  },

  // Food-specific action colour — used by the Scan CTA on the Food page.
  // Distinct from semantic.nutrition (which stays warm orange for macro
  // context) because the scan CTA needs a saturated coral-red that
  // harmonises with the calorie ring above it.
  food: {
    scan: '#FF6B4A',
    scanLight: '#FF7D5F', // +8% lightness in HSL for gradient top stop
  },

  // Legacy semantic (kept for compatibility)
  success: '#4DB872',
  warning: '#D9884E',
  danger: '#D4637A',
  teal: '#52A3BD',

  // Text — softer contrast, not harsh white
  textPrimary: '#E0E0E5',
  textSecondary: 'rgba(255,255,255,0.60)',
  textMuted: 'rgba(255,255,255,0.22)',

  // Light mode text helpers
  text: {
    muted: '#8E8E93',     // iOS system grey
  },

  // Neutral backgrounds
  neutral: {
    50: '#FAFAFA',
    100: '#F2F2F7',        // iOS system grouped background
    200: '#E5E5EA',
  },

  // Calendar dot colours — only TWO, ever
  calendar: {
    liftDay: '#7B72E9',    // purple dot = lift day (matches lifting)
    runDay: '#D4637A',      // coral dot = run day (matches running)
  },

  // Unified icon background
  iconBg: 'rgba(123, 114, 233, 0.10)',  // brand tint — subtle

  // Macro colours (nutrition breakdown) — bold saturated for visual impact
  macros: {
    calories: '#EF4444', // Tailwind red-500 — bold red
    protein: '#EC4899',  // Tailwind pink-500 — bold pink
    carbs: '#3B82F6',    // Tailwind blue-500 — bold blue
    fat: '#F59E0B',      // Tailwind amber-500 — bold amber
  },

  // Charts
  chartGrid: 'rgba(255,255,255,0.05)',
  chartTooltipBg: '#242429',

  // Pace colours (for splits — used in both themes)
  paceFast: '#4DB872',
  paceOnTarget: '#7B72E9',
  paceSlow: '#D4637A',
  // Gradient helpers — subtler transitions
  gradient: {
    brand: 'linear-gradient(135deg, #9590E0, #7B72E9)',
    brandCta: 'linear-gradient(135deg, #7B72E9, #52A3BD)',
  },
} as const;

export type MacroKey = keyof typeof THEME.macros;

/** Over-target colour: amber for modest overshoot (≤15%), deep red for substantial. */
// Deliberately removed — previously ramped numbers/bars on the Food hero
// from amber to deep red when over target. Going over isn't a failure
// state; the UI now simply keeps the base macro/ring colour and lets the
// overshoot speak for itself via the "over" label and the tertiary value.
