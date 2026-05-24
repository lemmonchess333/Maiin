import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject, TouchEvent as ReactTouchEvent } from "react";

/* Pull-to-refresh gesture hook — shared between Social, History, and
   Food page touch-handlers. Extracted from duplicated inline
   implementations in Social.tsx + History.tsx (the History
   implementation's own comment said "Same touch-handler shape as
   Social.tsx") so adding a third copy to Food doesn't widen the
   drift surface.

   Behaviour preserved verbatim from the existing implementations:

   - touchstart captures the start Y
   - touchmove fires when scrollY <= 0 (we're at the top of the
     scrollable area) AND the finger is moving downward; sets the
     "is swiping" flag and preventDefault so the browser's overscroll
     bounce doesn't fight the gesture
   - touchend: if pulled past `threshold` AND we're not already
     refreshing, fire onRefresh and surface `isRefreshing` until it
     settles

   Why we hand the touchmove listener directly to the DOM via
   useEffect rather than using onTouchMove on the bound element:
   React's synthetic touch events are passive in React 18+, which
   means preventDefault inside them is a no-op. We need the
   non-passive listener attached via addEventListener with
   { passive: false } so the preventDefault call actually suppresses
   browser overscroll. */
export interface UsePullToRefreshOptions {
  /** Refresh action invoked when the gesture commits. May return a
   *  promise; the hook awaits it and holds isRefreshing true for
   *  the lifetime of that promise (and at least `minDisplayMs`). */
  onRefresh: () => Promise<void> | void;
  /** Pixels of downward pull before the gesture commits. Mirrors the
   *  existing inline implementations' 80px constant. */
  threshold?: number;
  /** Minimum time isRefreshing stays true after onRefresh resolves —
   *  smooths the spinner so a near-instant refresh doesn't flash.
   *  Defaults to 0 (rely on the promise's own timing). Pages whose
   *  refresh action is fire-and-forget (no settling promise — e.g.
   *  History's `refreshRuns()` against `useRunningStats`) pass a
   *  value here instead of wrapping the call in a manual timer. */
  minDisplayMs?: number;
  /** CSS selector matched against the touchstart target's ancestors;
   *  the gesture is suppressed if any ancestor matches. Used by Food
   *  page to exclude FoodRow swipe-to-delete starting points so a
   *  row-drag doesn't also fire pull-to-refresh when the user is at
   *  scroll-top. */
  excludeSelector?: string;
}

export interface UsePullToRefreshReturn {
  /** True while a refresh is in-flight; pages render their indicator
   *  from this. */
  isRefreshing: boolean;
  /** Manually trigger the refresh (no gesture required). Honours the
   *  same isRefreshing guard so a programmatic trigger can't race
   *  with an in-flight gesture-triggered refresh. Used by Social's
   *  `tropos:social-tab-retap` event handler. */
  triggerRefresh: () => Promise<void>;
  /** Spread onto the outer scrollable container. The ref lets the
   *  hook attach the non-passive touchmove listener; the touchstart
   *  / touchend handlers are React-synthetic. */
  bindProps: {
    /* React 19's stricter `useRef<T>(null)` typing returns
       RefObject<T | null>; downstream consumers that need a non-
       null asserted ref should `containerRef.current!` at the
       point of use. The DOM listener wiring inside the hook
       already null-guards. */
    ref: RefObject<HTMLDivElement | null>;
    onTouchStart: (e: ReactTouchEvent) => void;
    onTouchEnd: (e: ReactTouchEvent) => void;
  };
}

const DEFAULT_THRESHOLD = 80;

export function usePullToRefresh({
  onRefresh,
  threshold = DEFAULT_THRESHOLD,
  minDisplayMs = 0,
  excludeSelector,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef(0);
  const isSwiping = useRef(false);
  const suppressed = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /* Stash the latest onRefresh in a ref so the touchend handler
     always sees the freshest callback without re-binding listeners
     on every render. Pattern matches the React FAQ for stable
     event-handler identity over time-varying logic. */
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const runRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const start = Date.now();
    try {
      await onRefreshRef.current();
    } finally {
      const elapsed = Date.now() - start;
      const wait = Math.max(0, minDisplayMs - elapsed);
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
      }
      setIsRefreshing(false);
    }
  }, [isRefreshing, minDisplayMs]);

  const handleTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      pullStartY.current = e.touches[0].clientY;
      isSwiping.current = false;
      /* Exclusion guard: if the touchstart originated inside an
         element matching excludeSelector (e.g. a Food page swipeable
         row), suppress the gesture for this whole touch sequence.
         Cleared on next touchstart. */
      if (excludeSelector && e.target instanceof Element) {
        suppressed.current = !!e.target.closest(excludeSelector);
      } else {
        suppressed.current = false;
      }
    },
    [excludeSelector]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: TouchEvent) => {
      if (suppressed.current) return;
      const diff = e.touches[0].clientY - pullStartY.current;
      if (diff > 0 && window.scrollY <= 0) {
        isSwiping.current = true;
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", handler, { passive: false });
    return () => el.removeEventListener("touchmove", handler);
  }, []);

  const handleTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      if (suppressed.current) {
        suppressed.current = false;
        return;
      }
      const diff = e.changedTouches[0].clientY - pullStartY.current;
      if (diff > threshold && isSwiping.current && !isRefreshing) {
        void runRefresh();
      }
      isSwiping.current = false;
    },
    [threshold, isRefreshing, runRefresh]
  );

  return {
    isRefreshing,
    triggerRefresh: runRefresh,
    bindProps: {
      ref: containerRef,
      onTouchStart: handleTouchStart,
      onTouchEnd: handleTouchEnd,
    },
  };
}
