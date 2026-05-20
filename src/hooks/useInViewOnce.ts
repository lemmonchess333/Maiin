import { useEffect, useRef } from "react";

interface UseInViewOnceOptions {
  /** Fraction of the element visible before we count it as "in view".
   *  Default 0.5 (matches the Home2 intent: a section counts as
   *  viewed once half of it is on-screen, not just one pixel
   *  scrolled past). */
  threshold?: number;
  /** When false, the hook is inert — caller can short-circuit when
   *  the underlying feature is disabled (eg. SSR / test mounts
   *  without IntersectionObserver). Defaults to true. */
  enabled?: boolean;
}

/**
 * Fire a callback exactly once when the element first enters the
 * viewport at the given threshold. Detaches the observer the
 * moment it fires, so re-entering view doesn't fire again.
 *
 * Drop-in for the Home2 `home_section_viewed` instrumentation —
 * each tracked section attaches the returned ref and supplies an
 * onView callback that fires the telemetry event. Designed to be
 * SSR-safe and test-friendly: when IntersectionObserver isn't
 * available the callback fires immediately on mount (treats the
 * whole section as "viewed" — better than silently dropping the
 * signal).
 *
 * Implementation notes:
 *   - `firedRef` tracks one-shot state via a ref rather than
 *     useState so the effect doesn't have to depend on (and
 *     re-run from) state changes — and so the immediate-fire path
 *     for the no-IO fallback doesn't trip the
 *     react-hooks/set-state-in-effect rule.
 *   - `onViewRef` snapshots the latest callback identity so the
 *     effect doesn't re-run on every parent render that passes an
 *     inline arrow.
 */
export function useInViewOnce(
  onView: () => void,
  { threshold = 0.5, enabled = true }: UseInViewOnceOptions = {},
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onViewRef = useRef(onView);
  const firedRef = useRef(false);
  useEffect(() => {
    onViewRef.current = onView;
  }, [onView]);

  useEffect(() => {
    if (!enabled || firedRef.current) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      firedRef.current = true;
      onViewRef.current();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            entry.intersectionRatio >= threshold &&
            !firedRef.current
          ) {
            firedRef.current = true;
            onViewRef.current();
            observer.disconnect();
            return;
          }
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, threshold]);

  return ref;
}
