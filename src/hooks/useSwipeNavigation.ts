import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { haptic } from "@/lib/haptic";

/**
 * Swipe-between-tabs gesture for the bottom-nav sections.
 *
 * A touchEND detector (NOT a live finger-follow pager): it measures the
 * gesture only when the finger lifts and then `navigate()`s to the adjacent
 * tab. Because it never calls preventDefault during touchmove, it can't
 * block vertical scrolling, and because it only acts on lift it can't fight
 * an in-progress horizontal gesture it loses the race to.
 *
 * Conflict avoidance (the hard part — see the swipe-affordance inventory):
 *  - Direction-lock: horizontal travel must dominate vertical (DIR_RATIO),
 *    so vertical scrolls never trigger a tab change.
 *  - Distance OR flick-velocity threshold: a deliberate swipe, not a twitch.
 *  - Edge guard: ignore gestures starting at the screen edge so iOS keeps
 *    its system back-swipe (and we don't double-navigate).
 *  - Opt-out / hand-off (resolved at touchEND because it's direction-
 *    dependent): find the nearest gesture-owning ancestor of the start
 *    target.
 *      • `[data-no-page-swipe]` / `[data-swipe-card]` → HARD block: never
 *        page-swipe from inside a horizontal scroller, chart, or
 *        swipe-to-delete row (these have no discrete boundary to hand off).
 *      • `[data-swipe-pager]` → an inner day-pager (Programme Lift/Run).
 *        Hand the gesture off to a tab change ONLY when the pager is at its
 *        boundary in the swipe direction (`data-swipe-at-start` /
 *        `data-swipe-at-end`); otherwise the inner pager consumes it. This
 *        is the iOS nested-pager behaviour: mid-list swipes change the day,
 *        edge swipes change the tab.
 *  - Single-touch only (ignore pinch/multi-touch).
 *  - Only fires when on one of `orderedRoutes` (the tab roots) — never on
 *    sub-pages like /settings or /crew/:id.
 *
 * Returns handlers to spread onto the scroll container that wraps the routed
 * page. `onDirection` is called (with +1 next / -1 prev) just before nav so
 * the host can drive a directional slide transition.
 */
const EDGE_GUARD_PX = 28;
const MIN_DISTANCE_PX = 64;
const FLICK_DISTANCE_PX = 32;
const FLICK_VELOCITY = 0.45; // px per ms
const DIR_RATIO = 1.5; // |dx| must exceed |dy| * this

interface SwipeStart {
  x: number;
  y: number;
  t: number;
  ignore: boolean;
  target: HTMLElement | null;
}

export function useSwipeNavigation(
  orderedRoutes: string[],
  currentPath: string,
  onDirection?: (dir: 1 | -1) => void
) {
  const navigate = useNavigate();
  const start = useRef<SwipeStart | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      start.current = { x: 0, y: 0, t: 0, ignore: true, target: null };
      return;
    }
    const t = e.touches[0];
    // Only the direction-INDEPENDENT bails happen here (multi-touch + edge
    // guard). The opt-out / pager hand-off is resolved at touchEND because
    // it depends on the swipe direction (which boundary we'd cross).
    const ignore =
      t.clientX < EDGE_GUARD_PX ||
      t.clientX > window.innerWidth - EDGE_GUARD_PX;
    start.current = {
      x: t.clientX,
      y: t.clientY,
      t: performance.now(),
      ignore,
      target: e.target as HTMLElement | null,
    };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || s.ignore) return;
      const idx = orderedRoutes.indexOf(currentPath);
      if (idx === -1) return; // not on a tab root — leave nav alone

      const ct = e.changedTouches[0];
      const dx = ct.clientX - s.x;
      const dy = ct.clientY - s.y;
      const dt = performance.now() - s.t || 1;

      if (Math.abs(dx) <= Math.abs(dy) * DIR_RATIO) return; // not horizontal
      const farEnough = Math.abs(dx) > MIN_DISTANCE_PX;
      const flick =
        Math.abs(dx) > FLICK_DISTANCE_PX && Math.abs(dx) / dt > FLICK_VELOCITY;
      if (!farEnough && !flick) return;

      // Opt-out / hand-off: consult the nearest gesture-owning ancestor of
      // the start target (see the docblock). data-no-page-swipe / -swipe-card
      // hard-block; data-swipe-pager hands off only at its boundary in the
      // swipe direction.
      const optOut = s.target?.closest?.(
        "[data-no-page-swipe],[data-swipe-card],[data-swipe-pager]"
      );
      if (optOut) {
        if (!optOut.hasAttribute("data-swipe-pager")) return; // hard block
        const atStart = optOut.getAttribute("data-swipe-at-start") === "true";
        const atEnd = optOut.getAttribute("data-swipe-at-end") === "true";
        // Right-swipe (prev) only escapes when the pager is at its start;
        // left-swipe (next) only when it's at its end. Otherwise the inner
        // day-pager consumes the gesture.
        if (dx > 0 && !atStart) return;
        if (dx < 0 && !atEnd) return;
      }

      // dx<0 = swipe left = advance to the next tab; dx>0 = previous.
      if (dx < 0 && idx < orderedRoutes.length - 1) {
        onDirection?.(1);
        haptic("light");
        navigate(orderedRoutes[idx + 1]);
      } else if (dx > 0 && idx > 0) {
        onDirection?.(-1);
        haptic("light");
        navigate(orderedRoutes[idx - 1]);
      }
    },
    [navigate, orderedRoutes, currentPath, onDirection]
  );

  return { onTouchStart, onTouchEnd };
}
