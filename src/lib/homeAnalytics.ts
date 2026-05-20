/**
 * Home page analytics — thin event-tracking shim.
 *
 * Same pattern as `paywallAnalytics.ts`, `foodAnalytics.ts`,
 * `socialAnalytics.ts`, and `historyAnalytics.ts`. Tropos has no
 * analytics provider wired today, so this module is a no-op-safe
 * wrapper: call sites emit structured events from day one, and
 * when a provider lands swap the body of `track()` to forward
 * through it without touching the call sites.
 */

import { logger } from "./logger";

export type HomeEvent =
  | "home_initial_render_ms"
  | "home_card_tapped"
  | "home_section_viewed";

/** Cards the Home2 lock identifies as primary glanceable tiles. */
export type HomeCard =
  | "performance"
  | "water"
  | "steps"
  | "weight"
  | "today_workout"
  | "today_run"
  | "trial_status"
  | "trajectory";

/** Lazy-loaded sections whose first paint is worth instrumenting. */
export type HomeSection =
  | "hero"
  | "stacked_cta"
  | "today_energy"
  | "hybrid_balance"
  | "insights";

export interface HomeEventMetadata {
  /** home_initial_render_ms: rounded ms from mount to first
   *  non-loading render. Target: <500ms p95 per Home2 cross-cutting
   *  performance pin. */
  durationMs?: number;
  /** home_card_tapped: which metric tile was tapped. */
  card?: HomeCard;
  /** home_section_viewed: which lazy-loaded section first crossed
   *  the viewport (or finished hydrating). */
  section?: HomeSection;
}

export function track(event: HomeEvent, metadata: HomeEventMetadata = {}): void {
  try {
    logger.log(`[home] ${event}`, metadata as Record<string, unknown>);
  } catch (err) {
    logger.warn("[home] track failed", { event, err: String(err) });
  }
}
