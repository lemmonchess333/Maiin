/**
 * History page analytics — thin event-tracking shim.
 *
 * Same pattern as `paywallAnalytics.ts`, `foodAnalytics.ts`, and
 * `socialAnalytics.ts`. Tropos has no analytics provider wired
 * today, so this module is a no-op-safe wrapper: call sites emit
 * structured events from day one, and when a provider lands swap
 * the body of `track()` to forward through it without touching the
 * call sites.
 *
 * The closed event set lets dashboards key off known dimensions
 * (tab, range, durationMs) once a provider is connected, instead
 * of grepping free-form log strings.
 */

import { emit } from "./analyticsClient";

export type HistoryEvent =
  | "history_tab_selected"
  | "history_range_changed"
  | "history_initial_render_ms"
  | "history_chart_tap_attempted";

export type HistoryTab =
  | "all"
  | "running"
  | "lifting"
  | "nutrition"
  | "performance"
  | "badges";

export type HistoryRange = "1W" | "1M" | "3M" | "6M" | "1Y";

export type HistoryRangeType = "pill" | "custom";

/** Hist5f S1 — which chart did the user tap. */
export type HistoryChart = "volume" | "macro" | "pi";

export interface HistoryEventMetadata {
  /** history_tab_selected: which top-level filter tab. */
  tab?: HistoryTab;
  /** history_range_changed: which preset range pill. */
  range?: HistoryRange;
  /** history_range_changed: pill vs custom. Per Hist4 lock pin (3):
   *  "Custom-range telemetry captures range type ('pill' | 'custom')
   *  + duration bucket … NOT exact from/to dates". Custom-range UI
   *  isn't built yet — values are 'pill' for v1; 'custom' lands when
   *  the custom-range picker ships. */
  rangeType?: HistoryRangeType;
  /** history_initial_render_ms: rounded ms from mount to first
   *  non-loading render (target: <500ms p95 per Hist4 cross-cutting
   *  performance pin). */
  durationMs?: number;
  /** history_chart_tap_attempted: which chart was tapped (Hist5f S1).
   *  Lock body in PR #724 originally specced "analytics_chart_tap_
   *  attempted" but the existing `history_*` prefix convention wins
   *  per the established eventing pattern across this module. */
  chart?: HistoryChart;
  /** history_chart_tap_attempted: bin key (ISO date / week / month
   *  per chartGranularity). */
  binKey?: string;
  /** history_chart_tap_attempted: value at the tapped data point —
   *  volume kg for VolumeChart, calorie-share % for MacroDistribution,
   *  PI 0-100 for PerformanceIndexChart. */
  value?: number;
}

export function track(
  event: HistoryEvent,
  metadata: HistoryEventMetadata = {}
): void {
  emit("history", event, metadata as Record<string, unknown>);
}
