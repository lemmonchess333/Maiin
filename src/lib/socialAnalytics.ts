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

import { emit } from "./analyticsClient";

export type SocialEvent =
  | "social_tab_selected"
  | "social_feed_subtab_changed"
  | "social_coachmark_dismissed"
  | "social_create_crew_tapped"
  | "social_initial_render_ms"
  /** S4e-P13: Fires when the Find tab renders with the restricted-
   *  user gate visible (search input disabled + restriction banner
   *  shown). One event per Find-tab mount; tracks how often the
   *  gate actually surfaces in production. */
  | "social_restricted_gate_shown"
  /** SOCIAL S1: share-card sheet opened (top of the share funnel). */
  | "share_card_opened"
  /** SOCIAL S1: a share card was exported (shared or downloaded) — the
   *  funnel's conversion event for the >10% share-rate benchmark. */
  | "share_card_exported"
  /** GOALS-CORE-01 Circles funnel. Feature-use signals only — never
   *  health values, member identities or circle titles. */
  | "circle_created"
  | "circle_invite_shared"
  | "circle_invite_accepted"
  | "circle_checkin_posted"
  | "circle_support_requested";

export type SocialTab = "feed" | "crews" | "find";
export type SocialFeedSubTab = "following" | "explore";
export type ShareCardTemplate =
  | "run"
  | "lift"
  | "hybrid"
  | "nutrition"
  | "recap";
export type ShareCardFormat = "story" | "square";
export type ShareCardBackground = "brand" | "dark" | "transparent" | "photo";

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
  /** share_card_*: which template / format / background. `exported`
   *  also carries the dispatch outcome. */
  template?: ShareCardTemplate;
  format?: ShareCardFormat;
  background?: ShareCardBackground;
  outcome?: "shared" | "downloaded" | "cancelled" | "failed";
  /** share_card_exported (S2): where the card went — a direct Instagram
   *  Stories handoff, or the generic OS share sheet (incl. download). */
  destination?: "instagram" | "sheet";
  /** circle_created: which goal type (schema enum, not free text). */
  circleType?: string;
}

export function track(
  event: SocialEvent,
  metadata: SocialEventMetadata = {}
): void {
  emit("social", event, metadata as Record<string, unknown>);
}
