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

  // Charts
  chartGrid: 'rgba(255,255,255,0.05)',
  chartTooltipBg: '#242429',

  // Pace colours (for splits — used in both themes)
  paceFast: '#4DB872',
  paceOnTarget: '#7B72E9',
  paceSlow: '#D4637A',
  // Brand solids (replaces gradient CTAs — intentional, not algorithmic)
  gradient: {
    brand: '#7B72E9',
    brandCta: '#7B72E9',
  },
} as const;
