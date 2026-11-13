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
import type { PurchasePending } from "./revenuecat";
import { emit } from "./analyticsClient";

export type PaywallEvent =
  | "paywall_viewed"
  | "paywall_plan_selected"
  | "paywall_cta_clicked"
  | "checkout_started"
  | "checkout_failed"
  /** The person closed the store's purchase sheet without buying. */
  | "checkout_cancelled"
  /** The store has the purchase and Pro is not on yet (`pending` says why). */
  | "checkout_pending"
  | "checkout_success_returned"
  | "checkout_cancelled_returned"
  | "restore_purchases_clicked"
  | "manage_subscription_clicked";

export type PaywallSource =
  | "upgrade_page"
  | "feature_gate"
  | "settings"
  | "adaptive_summary"
  /** The post-onboarding offer: /upgrade opened by onboarding's save. */
  | "onboarding"
  /** The Food page's photo-logging strip (gated tier). */
  | "food_page"
  /** Home's one-time prompt when the trial lapses. */
  | "trial_end"
  /** Home's countdown strip while the onboarding trial is live. */
  | "trial_strip"
  /** Home's Pro strip for a free account. */
  | "home_strip"
  /** Food's card telling a free account its personal target is ready
   *  (whole-app grill Q49, Q71, Q87). */
  | "personal_target"
  /** A half or full marathon plan past its free first week: Home's run
   *  card or Train's (whole-app grill Q85). */
  | "race_plan"
  | "unknown";

export interface PaywallEventMetadata {
  source?: PaywallSource;
  featureKey?: ProFeatureKey;
  selectedPlan?: PlanId;
  platform?: "web" | "ios" | "android";
  error?: string;
  pending?: PurchasePending;
}

/**
 * Emit a paywall event. No-op safe — the try/catch + provider-failure
 * fallback lives in `analyticsClient.emit`, which every per-surface
 * `track()` delegates through. When a real provider is wired, edit
 * `analyticsClient.ts` once and every surface gets it.
 */
export function track(
  event: PaywallEvent,
  metadata: PaywallEventMetadata = {}
): void {
  emit("paywall", event, metadata as Record<string, unknown>);
}
