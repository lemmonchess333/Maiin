/**
 * Shared analytics adapter. Single edit point for the analytics
 * backend. Events are delivered to Firebase Analytics (see
 * `analyticsProvider.ts` for the web/native split + gating) AND mirrored
 * to the dev-gated structured logger for local debugging.
 *
 * Provider params are run through `sanitizeAnalyticsParams` first so PII
 * (email, GPS, injury notes, raw meal text, …) can never reach the
 * third-party provider, regardless of what a call site passes. The dev
 * logger keeps the raw metadata — it's local-only and dev-gated.
 *
 * Per-surface modules (homeAnalytics, paywallAnalytics, foodAnalytics,
 * lifecycleAnalytics, etc.) keep their own event-type unions for type
 * safety at call sites and delegate to `emit()` here for the actual
 * delivery + try/catch.
 *
 * Failure semantics: analytics MUST NOT block the calling flow. Any
 * failure is captured and re-emitted as `logger.warn` with the surface
 * prefix and stringified error. No re-throw.
 */
import { logger } from "./logger";
import { logAnalyticsEvent } from "./analyticsProvider";
import { sanitizeAnalyticsParams } from "./analyticsRedaction";

export function emit(
  surface: string,
  event: string,
  metadata: Record<string, unknown>
): void {
  try {
    logger.log(`[${surface}] ${event}`, metadata);
    // `surface` is a closed enum-ish label (not user data) and disambiguates
    // events whose names aren't surface-prefixed (e.g. checkout_started).
    logAnalyticsEvent(event, { ...sanitizeAnalyticsParams(metadata), surface });
  } catch (err) {
    logger.warn(`[${surface}] track failed`, { event, err: String(err) });
  }
}
