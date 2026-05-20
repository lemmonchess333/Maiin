/**
 * Food page analytics — thin event-tracking shim.
 *
 * Same pattern as `paywallAnalytics.ts`. Tropos has no analytics
 * provider wired today, so this module is a no-op-safe wrapper:
 * call sites emit structured events from day one, and when a
 * provider lands, swap the body of `track()` to forward through it
 * without touching the call sites.
 *
 * The closed event set lets dashboards key off known dimensions
 * (slot, direction) once a provider is connected, instead of
 * grepping free-form log strings.
 */

import { logger } from "./logger";
import type { MealKey } from "@/components/food/mealConstants";

export type FoodEvent =
  | "food_meal_slot_tapped"
  | "food_date_navigated"
  | "food_composer_focused"
  | "food_initial_render_ms"
  | "food_pantry_eviction";

export interface FoodEventMetadata {
  /** food_meal_slot_tapped: which slot ("breakfast" | "lunch" | "snacks" | "dinner"). */
  slot?: MealKey;
  /** food_date_navigated: direction of navigation. */
  direction?: "prev" | "next" | "pick";
  /** food_initial_render_ms: rounded ms from mount to first non-loading
   *  render. Captures the Food page's perceived initial-render budget
   *  (target: <500ms p95 per Food6 cross-cutting performance pin). */
  durationMs?: number;
  /** food_pantry_eviction: the doc id of the evicted favourite. */
  favouriteId?: string;
  /** food_pantry_eviction: useCount of the evicted favourite, so
   *  dashboards can tell fossil-prunes (useCount=1) from heavier
   *  evictions (useCount>=2) without re-deriving from logs. */
  useCount?: number;
  /** food_pantry_eviction: total favourites before the eviction
   *  fired — useful for confirming the SOFT_CAP threshold lines
   *  up with observed prune patterns. */
  totalBefore?: number;
}

export function track(event: FoodEvent, metadata: FoodEventMetadata = {}): void {
  try {
    logger.log(`[food] ${event}`, metadata as Record<string, unknown>);
  } catch (err) {
    logger.warn("[food] track failed", { event, err: String(err) });
  }
}
