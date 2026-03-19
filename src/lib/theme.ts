// Dark mode colour system — used as enhancement for dark mode toggle
// Accent colours are used in both light and dark themes
export const THEME = {
  // Dark mode backgrounds (only applied when .dark is active)
  bg: '#0F0F14',
  surface: '#1C1C24',
  elevated: '#2A2A35',

  // Accent colours (sport-specific — used in both light & dark)
  running: '#E8637A',
  runningLight: '#F08A9B',
  lifting: '#7C6EF6',
  liftingLight: '#9B90F8',
  brand: '#7C6EF6',
  brandLight: '#9B90F8',

  // Semantic — harmonised hues (same saturation/brightness band)
  semantic: {
    activity: '#7C6EF6',   // purple — weight, brand, lifting
    hydration: '#4EADCC',  // teal — water
    vitals: '#E8637A',     // coral — health, heart rate, recovery
    nutrition: '#ED8B4E',  // warm orange — food, calories, macros
    positive: '#4ECC7A',   // green — positive states (streak, PR)
    negative: '#E8637A',   // shares coral — negative states, alerts
  },

  // Legacy semantic (kept for compatibility)
  success: '#4ECC7A',
  warning: '#ED8B4E',
  danger: '#E8637A',
  teal: '#4EADCC',

  // Text
  textPrimary: '#E8E8ED',
  textSecondary: 'rgba(255,255,255,0.72)',
  textMuted: 'rgba(255,255,255,0.25)',

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
    liftDay: '#7C6EF6',    // purple dot = lift day (matches lifting)
    runDay: '#E8637A',      // coral dot = run day (matches running)
  },

  // Unified icon background
  iconBg: 'rgba(124, 110, 246, 0.12)',  // brand tint — increased for WCAG contrast

  // Charts
  chartGrid: 'rgba(255,255,255,0.06)',
  chartTooltipBg: '#2A2A35',

  // Pace colours (for splits — used in both themes)
  paceFast: '#4ECC7A',
  paceOnTarget: '#7C6EF6',
  paceSlow: '#E8637A',
  // Gradient helpers
  gradient: {
    brand: 'linear-gradient(135deg, #9B90F8, #7C6EF6)',
    brandCta: 'linear-gradient(135deg, #7C6EF6, #4EADCC)',
  },
} as const;
