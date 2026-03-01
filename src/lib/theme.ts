// Dark mode colour system — used as enhancement for dark mode toggle
// Accent colours are used in both light and dark themes
export const THEME = {
  // Dark mode backgrounds (only applied when .dark is active)
  bg: '#0F0F14',
  surface: '#1C1C24',
  elevated: '#2A2A35',

  // Accent colours (sport-specific — used in both light & dark)
  running: '#FF6B6B',
  runningLight: '#FF8A8A',
  lifting: '#6C7CFF',
  liftingLight: '#8B99FF',
  brand: '#8b5cf6',
  brandLight: '#a78bfa',

  // Semantic
  success: '#34D399',
  warning: '#FFB547',
  danger: '#EF4444',
  teal: '#00D4AA',

  // Text (dark mode only)
  textPrimary: '#E8E8ED',
  textSecondary: 'rgba(255,255,255,0.55)',
  textMuted: 'rgba(255,255,255,0.25)',

  // Charts
  chartGrid: 'rgba(255,255,255,0.06)',
  chartTooltipBg: '#2A2A35',

  // Pace colours (for splits — used in both themes)
  paceFast: '#34D399',
  paceOnTarget: '#8b5cf6',
  paceSlow: '#EF4444',
} as const;
