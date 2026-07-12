/**
 * Shared chart styling tokens for the analytics charts.
 *
 * Hist5f P3 anchored the three Analytics-tab charts on a single tooltip
 * treatment so they read as a coherent set. Before extraction the same
 * six-property object lived as a verbatim copy in all three files, which
 * left the "coherent set" invariant enforced by copy-paste — a tweak to
 * one would silently drift from the other two.
 *
 * The grid and axis-tick tokens below close out the SAME failure mode a
 * second time: the identical CartesianGrid block lived in five chart
 * files (one of which had already drifted to a different grid colour),
 * and the axis tick style had split into two dialects — half the charts
 * on `currentColor + opacity`, half on the muted-foreground token. Every
 * analytics chart now imports these instead of re-declaring them.
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

/** The one horizontal-rules-only grid every analytics chart uses. */
export const CHART_GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: "hsl(var(--border))",
  vertical: false,
} as const;

/** The one axis tick treatment (10px, muted token — theme-aware in both
 *  light and dark, unlike the old `currentColor + opacity` dialect). */
export const CHART_AXIS_TICK = {
  fontSize: 10,
  fill: "hsl(var(--muted-foreground))",
} as const;
