/**
 * Programme page analytics — thin event-tracking shim.
 *
 * Same pattern as `paywallAnalytics.ts`, `foodAnalytics.ts`,
 * `socialAnalytics.ts`, `historyAnalytics.ts`, and
 * `homeAnalytics.ts`. Tropos has no analytics provider wired
 * today, so this module is a no-op-safe wrapper: call sites emit
 * structured events from day one, and when a provider lands swap
 * the body of `track()` to forward through it without touching
 * the call sites.
 */

import { emit } from "./analyticsClient";

export type ProgrammeEvent =
  | "programme_section_viewed"
  | "programme_day_tapped"
  | "programme_deload_banner_viewed"
  | "programme_deload_banner_action";

/** Lazy-loaded / below-fold sections worth instrumenting. */
export type ProgrammeSection =
  | "week_phase_row"
  | "day_stepper"
  | "session_card"
  | "deload_banner"
  | "race_goal_card"
  | "run_plan";

/** Pgm3 deload banner has two terminal user actions; pin the
 *  alternatives explicitly so the event union is self-documenting. */
export type ProgrammeDeloadAction = "applied" | "dismissed";

export interface ProgrammeEventMetadata {
  /** programme_section_viewed: which section first crossed into
   *  view (~50% threshold per the useInViewOnce primitive). */
  section?: ProgrammeSection;
  /** programme_day_tapped: 0-based day index within the displayed
   *  week. Lets dashboards see which days drive engagement
   *  (typically Monday + Wednesday + Saturday cluster). */
  dayIndex?: number;
  /** programme_deload_banner_action: which CTA the user picked. */
  action?: ProgrammeDeloadAction;
}

export function track(
  event: ProgrammeEvent,
  metadata: ProgrammeEventMetadata = {}
): void {
  emit("programme", event, metadata as Record<string, unknown>);
}
