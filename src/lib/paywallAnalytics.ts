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
import { logger } from "./logger";

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
 * Emit a paywall event. No-op safe: any provider failure is caught
 * and logged via `logger.warn` (which routes to the existing
 * structured logger; no console noise in production). The promise
 * surface is intentional — when a real provider lands, async sends
 * can be awaited from tests.
 */
export function track(
  event: PaywallEvent,
  metadata: PaywallEventMetadata = {},
): void {
  try {
    // No-op delivery today. Replace the body of this try with the
    // provider's send() when one is wired. The shape is what the
    // call sites already pass. Logger.log only surfaces in dev so
    // production builds carry zero analytics weight until a real
    // provider is connected.
    logger.log(`[paywall] ${event}`, metadata as Record<string, unknown>);
  } catch (err) {
    // Defensive: never let analytics surface a runtime exception
    // into the checkout flow.
    logger.warn("[paywall] track failed", { event, err: String(err) });
  }
}
