import { useSyncExternalStore } from "react";
import type { CalorieRingMode } from "@/components/food/CalorieRing";
import { readString, writeString } from "@/lib/localStore";

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

/* "Left" until the person turns the ring to what they logged, so existing
   accounts and Home's food card keep reading "kcal left". The mode moves
   only the number and its words: every ring and bar fills with what was
   eaten in both (`calorieRingFill.ts`, DS4, 7 November 2026), so an empty
   morning is a grey track whichever mode is on (DESIGN_GUIDE §14m rules 16
   and 33). */
const DEFAULT_MODE: CalorieRingMode = "left";

function read(): CalorieRingMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const stored = readString(STORAGE_KEY);
  return stored === "left" || stored === "eaten" ? stored : DEFAULT_MODE;
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
  return DEFAULT_MODE;
}

export function setCalorieRingMode(next: CalorieRingMode): void {
  if (next === current) return;
  current = next;
  // A refused write (private mode) still leaves the in-memory value for
  // this session, which is the half the user notices.
  writeString(STORAGE_KEY, next);
  for (const fn of listeners) fn();
}

export function useCalorieRingMode(): CalorieRingMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
