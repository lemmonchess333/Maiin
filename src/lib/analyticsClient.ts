/**
 * Shared analytics adapter. Single edit point for swapping in a real
 * provider (Segment, Mixpanel, Firebase Analytics, etc.) when one is
 * wired up. Until then, events are routed through the structured
 * logger; production builds carry near-zero analytics weight because
 * `logger.log` is dev-gated.
 *
 * Per-surface modules (homeAnalytics, paywallAnalytics, foodAnalytics,
 * etc.) keep their own event-type unions for type safety at call sites
 * and delegate to `emit()` here for the actual delivery + try/catch.
 *
 * Failure semantics: analytics MUST NOT block the calling flow.
 * `logger.log` failures are captured and re-emitted as `logger.warn`
 * with the surface prefix and stringified error. No re-throw.
 */
import { logger } from "./logger";

export function emit(
  surface: string,
  event: string,
  metadata: Record<string, unknown>,
): void {
  try {
    logger.log(`[${surface}] ${event}`, metadata);
  } catch (err) {
    logger.warn(`[${surface}] track failed`, { event, err: String(err) });
  }
}
