/**
 * Paywall analytics — thin event-tracking shim.
 *
 * Tropos doesn't ship with an app-level analytics provider today
 * (firebase analytics isn't wired and there's no segment / posthog /
 * mixpanel client). This module is a no-op-safe wrapper so paywall
 * surfaces can emit structured events from day one without blocking
 * on a provider decision. When an analytics provider lands, swap
 * `track()` to forward through it — the call sites stay unchanged.
 *
 * Why structured events rather than ad-hoc logger calls:
 *   - The set of events is closed (no free-form strings) so dashboards
 *     can be built against a known schema.
 *   - Each event carries the same metadata shape (source, featureKey,
 *     selectedPlan, platform) so we can slice by entry point without
 *     re-instrumenting.
 *   - Failures are swallowed by `track()` — analytics MUST NOT block
 *     the checkout flow. Per the spec: "Do not block the flow if
 *     analytics fails."
 */

import type { ProFeatureKey } from "./proFeatures";
import type { PlanId } from "./proPlans";
import { emit } from "./analyticsClient";

export type PaywallEvent =
  | "paywall_viewed"
  | "paywall_plan_selected"
  | "paywall_cta_clicked"
  | "checkout_started"
  | "checkout_failed"
  | "checkout_success_returned"
  | "checkout_cancelled_returned"
  | "restore_purchases_clicked"
  | "manage_subscription_clicked";

export type PaywallSource =
  | "upgrade_page"
  | "feature_gate"
  | "settings"
  | "adaptive_summary"
  | "unknown";

export interface PaywallEventMetadata {
  source?: PaywallSource;
  featureKey?: ProFeatureKey;
  selectedPlan?: PlanId;
  platform?: "web" | "ios" | "android";
  error?: string;
}

/**
 * Emit a paywall event. No-op safe — the try/catch + provider-failure
 * fallback lives in `analyticsClient.emit`, which every per-surface
 * `track()` delegates through. When a real provider is wired, edit
 * `analyticsClient.ts` once and every surface gets it.
 */
export function track(
  event: PaywallEvent,
  metadata: PaywallEventMetadata = {},
): void {
  emit("paywall", event, metadata as Record<string, unknown>);
}
