/**
 * Food page analytics — thin event-tracking shim.
 *
 * Same pattern as `paywallAnalytics.ts`: a closed event union, one
 * metadata shape, delegating to `analyticsClient.emit()` — which runs
 * every param through `sanitizeAnalyticsParams` before delivery, so no
 * free text can reach the provider even if a call site is careless.
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
  | "food_timeline_perf"
  | "food_pantry_eviction"
  | "food_pantry_graduated"
  | "food_pantry_chip_tapped"
  | "food_pantry_chip_removed"
  | "food_pantry_typeahead_selected"
  // Companion batch B0 — the repeat-logging journey, measured end to end so
  // "logging got easier" is a reading rather than a claim. `food_log_start`
  // opens the attempt, `food_log_saved` closes it with the path taken and
  // what it cost (taps, ms), `food_log_undo` says the app got it wrong, and
  // `meal_deleted` catches the correction that happens later instead.
  | "food_log_start"
  | "food_log_saved"
  | "food_log_undo"
  | "meal_deleted";

/**
 * How a meal reached the diary. `usual` is the standing row, `copy` is
 * copy-yesterday, `photo` is the AI scan — the scan is a real entry path
 * and omitting it would silently misattribute those saves to `manual`.
 */
export type FoodLogPath =
  | "usual"
  | "typeahead"
  | "copy"
  | "nl"
  | "manual"
  | "barcode"
  | "photo";

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
  /** food_meal_slot_perf (retired with the slot sections) +
   *  food_timeline_perf: number of grouped diary rows at render
   *  time. Drives the Food6e re-evaluation trigger T1 (P95
   *  itemCount). */
  itemCount?: number;
  /** food_meal_slot_perf (retired) + food_timeline_perf: ms to
   *  render the diary list, measured via performance.now() captured
   *  at render-start vs next useEffect cycle. Drives the Food6e
   *  re-evaluation trigger T1 (P95 renderDurationMs > 100). */
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
  /** food_log_saved / _undo: which entry path produced the meal. */
  path?: FoodLogPath;
  /** food_log_saved: taps between `food_log_start` and the write. The
   *  effort number the "Your usual" row exists to reduce. */
  taps?: number;
  /** meal_deleted: seconds between the meal being logged and deleted.
   *  Separates a wrong-tap correction (seconds) from a change of mind
   *  (hours) — the two want different fixes. */
  ageSeconds?: number;
}

export function track(
  event: FoodEvent,
  metadata: FoodEventMetadata = {}
): void {
  emit("food", event, metadata as Record<string, unknown>);
}
