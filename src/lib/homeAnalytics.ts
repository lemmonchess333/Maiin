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

import { emit } from "./analyticsClient";

export type HomeEvent =
  | "home_initial_render_ms"
  | "home_card_tapped"
  | "home_section_viewed"
  // Companion batch B0 — the weigh-in journey. Opening the sheet and not
  // saving is the signal a weigh-in flow most needs and the one no current
  // event can see, so the open is tracked separately from the save.
  | "weight_sheet_open"
  | "weight_log_saved";

/** Cards the Home2 lock identifies as primary glanceable tiles. */
export type HomeCard =
  | "performance"
  | "water"
  | "steps"
  | "weight"
  | "today_workout"
  | "today_run"
  | "first_meal"
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
  /** weight_log_saved: taps between opening the sheet and the write. */
  taps?: number;
  /** weight_log_saved: the value was typed rather than dialled. Both are
   *  supported deliberately; which one people reach for decides whether
   *  the dial earns its space. */
  typed?: boolean;
  /** weight_log_saved: the dial was moved at least once. Not the inverse
   *  of `typed` — a user can dial to roughly the right place and then
   *  type the exact figure. */
  picker?: boolean;
  /** weight_log_saved: the unit the value was entered in. */
  unit?: "kg" | "lbs" | "st";
}

export function track(
  event: HomeEvent,
  metadata: HomeEventMetadata = {}
): void {
  emit("home", event, metadata as Record<string, unknown>);
}
