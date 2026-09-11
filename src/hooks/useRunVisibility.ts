import { useEffect, useRef } from "react";

/**
 * Tracks document visibility state and provides callbacks for
 * coordinating run subsystems (timer, GPS, audio) during
 * background/foreground transitions.
 *
 * On PWA/web, browsers throttle timers and pause GPS when the tab
 * is backgrounded. This hook detects those transitions so the run
 * page can pause GPS (saving battery), reconcile elapsed time on
 * return, and notify the user of any data gaps.
 *
 * Callback-only. It returns nothing: the visibility flag and the last
 * gap were also exposed as state, and no consumer ever read them — Run
 * drives everything from `onHidden` / `onVisible`, whose event carries
 * the gap. State that nothing reads is a second copy of the truth that
 * cannot be checked against the first.
 */

export interface VisibilityEvent {
  /** Time the app was hidden (ms since epoch) */
  hiddenAt: number;
  /** Time the app became visible again (ms since epoch) */
  visibleAt: number;
  /** Duration the app was hidden (seconds) */
  hiddenDuration: number;
}

interface UseRunVisibilityOptions {
  /** Called when the app goes to background */
  onHidden?: () => void;
  /** Called when the app returns to foreground, with gap info */
  onVisible?: (event: VisibilityEvent) => void;
  /** Only fire callbacks when enabled (e.g., during active run) */
  enabled?: boolean;
}

export function useRunVisibility({
  onHidden,
  onVisible,
  enabled = true,
}: UseRunVisibilityOptions) {
  const hiddenAtRef = useRef<number | null>(null);
  const onHiddenRef = useRef(onHidden);
  const onVisibleRef = useRef(onVisible);

  // Keep callback refs fresh without triggering effect re-runs
  useEffect(() => {
    onHiddenRef.current = onHidden;
  }, [onHidden]);
  useEffect(() => {
    onVisibleRef.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        onHiddenRef.current?.();
      } else if (document.visibilityState === "visible") {
        const hiddenAt = hiddenAtRef.current;
        if (hiddenAt) {
          const now = Date.now();
          const event: VisibilityEvent = {
            hiddenAt,
            visibleAt: now,
            hiddenDuration: (now - hiddenAt) / 1000,
          };
          hiddenAtRef.current = null;
          onVisibleRef.current?.(event);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [enabled]);
}
