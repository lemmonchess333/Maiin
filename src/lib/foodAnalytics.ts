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

import { emit } from "./analyticsClient";
import type { MealKey } from "@/components/food/mealConstants";

export type FoodEvent =
  | "food_meal_slot_tapped"
  | "food_date_navigated"
  | "food_composer_focused"
  | "food_initial_render_ms"
  | "food_meal_slot_perf"
  | "food_pantry_eviction"
  | "food_pantry_graduated"
  | "food_pantry_chip_tapped"
  | "food_pantry_chip_removed"
  | "food_pantry_typeahead_selected";

export interface FoodEventMetadata {
  /** food_meal_slot_tapped + food_meal_slot_perf: which slot
   *  ("breakfast" | "lunch" | "snacks" | "dinner"). */
  slot?: MealKey;
  /** food_date_navigated: direction of navigation. */
  direction?: "prev" | "next" | "pick";
  /** food_initial_render_ms: rounded ms from mount to first non-loading
   *  render. Captures the Food page's perceived initial-render budget
   *  (target: <500ms p95 per Food6 cross-cutting performance pin). */
  durationMs?: number;
  /** food_meal_slot_perf: number of meals in the slot at render
   *  time. Drives the Food6e re-evaluation trigger T1 (P95
   *  itemCount). */
  itemCount?: number;
  /** food_meal_slot_perf: ms to render the FoodMealSection,
   *  measured via performance.now() captured at render-start vs
   *  next useEffect cycle. Drives the Food6e re-evaluation
   *  trigger T1 (P95 renderDurationMs > 100). */
  renderDurationMs?: number;
  /** food_pantry_*: the doc id of the favourite involved. */
  favouriteId?: string;
  /** food_pantry_eviction / _graduated / _chip_tapped: useCount of
   *  the favourite. On eviction this distinguishes fossil-prunes
   *  (useCount=1) from heavier evictions. On graduation this is
   *  always >= 2. On chip-tap this is the pre-increment count. */
  useCount?: number;
  /** food_pantry_eviction: total favourites before the eviction
   *  fired — useful for confirming the SOFT_CAP threshold lines
   *  up with observed prune patterns. */
  totalBefore?: number;
  /** food_pantry_graduated / _chip_tapped: originating source
   *  ("manual" | "photo" | "barcode" | "search" | "nl") so the
   *  graduation funnel can be split by entry path. */
  source?: string;
}

export function track(
  event: FoodEvent,
  metadata: FoodEventMetadata = {}
): void {
  emit("food", event, metadata as Record<string, unknown>);
}
