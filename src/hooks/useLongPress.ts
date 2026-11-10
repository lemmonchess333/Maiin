import { useCallback, useEffect, useRef } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";

/** Held this long without moving, a touch is a long press. iOS starts its
 *  own text-selection callout at about 500 ms, so it feels native. */
export const LONG_PRESS_MS = 500;
/** Drift, in px, that turns a pending long press into a scroll or a swipe.
 *  A finger never stays perfectly still; 10 px is above its tremor and
 *  below a scroll. */
export const LONG_PRESS_MOVE_PX = 10;
/** After a fired long press, the click iOS synthesises as the finger lifts
 *  is swallowed for this long from the lift, so the press does not also
 *  tap, however long the finger stayed down. */
export const LONG_PRESS_CLICK_MS = 400;

/**
 * A touch long press on something that also has a tap.
 *
 * `start` on touchstart, `move` on touchmove, `end` on touchend and
 * touchcancel. When the press fires, `onLongPress` gets what `start` was
 * given and where the finger came down. The element's onClick asks
 * `swallowClick()` first: it is true once, for the click that follows a
 * fired long press, and that click should then do nothing.
 *
 * The Quick Add rows in FoodSuggestionsDropdown keep their own copy of the
 * same three numbers.
 */
export function useLongPress<T>(
  onLongPress: (target: T, at: { x: number; y: number }) => void
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const swallowUntil = useRef(0);
  /** The press in progress has fired: its lift opens the swallow window. */
  const fired = useRef(false);
  const callback = useRef(onLongPress);
  useEffect(() => {
    callback.current = onLongPress;
  }, [onLongPress]);

  const clear = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  /* The finger lifts (or the touch is cancelled). After a fired press the
     click that follows comes now, not when the press fired, so the window
     is counted from here. */
  const end = useCallback(() => {
    if (fired.current) {
      fired.current = false;
      swallowUntil.current = Date.now() + LONG_PRESS_CLICK_MS;
    }
    clear();
  }, [clear]);

  useEffect(() => clear, [clear]);

  const start = useCallback(
    (e: ReactTouchEvent, target: T) => {
      clear();
      fired.current = false;
      const touch = e.touches[0];
      if (!touch || e.touches.length > 1) return;
      const at = { x: touch.clientX, y: touch.clientY };
      origin.current = at;
      timer.current = setTimeout(() => {
        timer.current = null;
        origin.current = null;
        fired.current = true;
        swallowUntil.current = Date.now() + LONG_PRESS_CLICK_MS;
        callback.current(target, at);
      }, LONG_PRESS_MS);
    },
    [clear]
  );

  const move = useCallback(
    (e: ReactTouchEvent) => {
      const from = origin.current;
      const touch = e.touches[0];
      if (!from || !touch) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) clear();
    },
    [clear]
  );

  const swallowClick = useCallback(() => {
    if (Date.now() > swallowUntil.current) return false;
    swallowUntil.current = 0;
    return true;
  }, []);

  return { start, move, end, swallowClick };
}
