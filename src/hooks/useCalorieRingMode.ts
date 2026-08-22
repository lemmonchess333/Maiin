import { useSyncExternalStore } from "react";
import type { CalorieRingMode } from "@/components/food/CalorieRing";

const STORAGE_KEY = "tropos.food.calorieRingMode";

/**
 * The Food hero's display mode, shared across components.
 *
 * It was `useState` inside `FoodHeroCard`, which is correct until a SECOND
 * surface needs it — and one does. `HeroDrillDownSheet` renders from
 * `Food.tsx`, a sibling, so it could not see the mode and drew every macro
 * bar as consumed%. The tile drains and the sheet fills, for the same data,
 * one tap apart.
 *
 * A module-level store rather than lifting the state into `Food.tsx`,
 * because lifting would make `FoodHeroCard.mode` a controlled prop and push
 * the persistence up with it — a wider change than the defect warrants, and
 * one that leaves the next consumer to thread it again. Here both
 * components subscribe and a toggle in either is seen by both.
 *
 * `useSyncExternalStore` rather than a `useState` + effect pair: the store
 * is external (localStorage plus a subscriber set), which is exactly what
 * it is for, and it gives a server snapshot for free.
 */

function read(): CalorieRingMode {
  if (typeof window === "undefined") return "left";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "eaten"
      ? "eaten"
      : "left";
  } catch {
    return "left";
  }
}

let current: CalorieRingMode = read();
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  /* Re-read on the FIRST subscriber, not just at module load. A module
     store initialised once cannot see a value written while nothing was
     mounted — another tab, a restored session, or (how this surfaced) a
     test that seeds storage and then mounts. Mounting should reflect what
     is persisted NOW; between mounts there is nobody to notify anyway, so
     refreshing here costs one read and closes the whole class. */
  if (listeners.size === 0) current = read();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Cached so `useSyncExternalStore` sees a stable value between writes. */
function getSnapshot(): CalorieRingMode {
  return current;
}

/** SSR / prerender: no storage, so the documented default. */
function getServerSnapshot(): CalorieRingMode {
  return "left";
}

export function setCalorieRingMode(next: CalorieRingMode): void {
  if (next === current) return;
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage can throw in private mode; the in-memory value still holds
    // for this session, which is the half the user notices.
  }
  for (const fn of listeners) fn();
}

export function useCalorieRingMode(): CalorieRingMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Test seam — resets the module store between cases. */
export function __resetCalorieRingMode(): void {
  current = read();
  for (const fn of listeners) fn();
}
