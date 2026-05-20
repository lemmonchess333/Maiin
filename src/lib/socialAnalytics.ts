/**
 * Social page analytics — thin event-tracking shim.
 *
 * Same pattern as `paywallAnalytics.ts` and `foodAnalytics.ts`.
 * Tropos has no analytics provider wired today, so this module is a
 * no-op-safe wrapper: call sites emit structured events from day
 * one, and when a provider lands, swap the body of `track()` to
 * forward through it without touching the call sites.
 *
 * The closed event set lets dashboards key off known dimensions
 * (tab, subTab, durationMs) once a provider is connected, instead
 * of grepping free-form log strings.
 */

import { logger } from "./logger";

export type SocialEvent =
  | "social_tab_selected"
  | "social_feed_subtab_changed"
  | "social_coachmark_dismissed"
  | "social_create_crew_tapped"
  | "social_initial_render_ms";

export type SocialTab = "feed" | "crews" | "find";
export type SocialFeedSubTab = "following" | "explore";

export interface SocialEventMetadata {
  /** social_tab_selected: which top-level tab. */
  tab?: SocialTab;
  /** social_feed_subtab_changed: which feed sub-tab. */
  subTab?: SocialFeedSubTab;
  /** social_coachmark_dismissed: the storageKey of the dismissed mark. */
  coachmarkKey?: string;
  /** social_initial_render_ms: rounded ms from mount to first
   *  non-loading render (target: <500ms p95 per Soc5 cross-cutting
   *  performance pin). */
  durationMs?: number;
}

export function track(event: SocialEvent, metadata: SocialEventMetadata = {}): void {
  try {
    logger.log(`[social] ${event}`, metadata as Record<string, unknown>);
  } catch (err) {
    logger.warn("[social] track failed", { event, err: String(err) });
  }
}
