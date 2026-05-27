/**
 * Shared chart styling tokens for the three Analytics charts
 * (VolumeChart, MacroDistribution, PerformanceIndexChart).
 *
 * Hist5f P3 anchored these three on a single tooltip treatment so
 * they read as a coherent set. Before extraction the same six-
 * property object lived as a verbatim copy in all three files,
 * which left the "coherent set" invariant enforced by copy-paste —
 * a tweak to one would silently drift from the other two.
 */

import { THEME } from "@/lib/theme";

export const CHART_TOOLTIP_STYLE = {
  background: THEME.chartTooltipBg,
  border: "none" as const,
  borderRadius: 12,
  fontSize: 12,
  color: THEME.textPrimary,
  padding: "8px 12px",
};
