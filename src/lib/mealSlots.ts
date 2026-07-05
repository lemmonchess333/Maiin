/**
 * Meal-slot derivation — pure, shared by the Food diary timeline and the
 * copy-from-yesterday segmentation.
 *
 * Extracted verbatim from Food.tsx's inline `getMealCategory` when the
 * diary moved from four fixed slot sections to the chronological
 * timeline (2026-07 interview decision — slot becomes row METADATA, so
 * the derivation needs to be testable on its own). Semantics are
 * load-bearing and pinned by tests:
 *
 *  - an explicit `meal` field (set by slot targeting, copies, and the
 *    edit sheet's slot picker) always wins;
 *  - otherwise the slot derives from the LOCAL log hour — before 11
 *    breakfast, before 17 lunch, else dinner;
 *  - "snacks" is NEVER auto-assigned — it only exists explicitly;
 *  - a missing/foreign `createdAt` falls back to lunch (the mid-day
 *    neutral), never throws.
 *
 * No React, no Firebase imports — `createdAt` stays `unknown` because it
 * round-trips Firestore Timestamps and we narrow structurally.
 */

import { MEAL_ORDER, type MealKey } from "@/components/food/mealConstants";

export interface SlottableMeal {
  meal?: string;
  createdAt?: unknown;
}

/** Narrow a Firestore-Timestamp-shaped `createdAt` to a Date, or null
 *  when it's missing or not Timestamp-like. Also drives the timeline's
 *  per-row time label. */
export function mealLoggedAt(createdAt: unknown): Date | null {
  if (
    !createdAt ||
    typeof (createdAt as { toDate?: unknown }).toDate !== "function"
  ) {
    return null;
  }
  return (createdAt as { toDate: () => Date }).toDate();
}

export function mealSlotFor(item: SlottableMeal | undefined): MealKey {
  // Explicit meal field first (slot targeting, copies, edit-sheet moves).
  if (item?.meal && (MEAL_ORDER as readonly string[]).includes(item.meal)) {
    return item.meal as MealKey;
  }
  // Time-based fallback — snacks is never auto-assigned.
  const loggedAt = mealLoggedAt(item?.createdAt);
  if (!loggedAt) return "lunch";
  const hour = loggedAt.getHours();
  if (hour < 11) return "breakfast";
  if (hour < 17) return "lunch";
  return "dinner";
}
