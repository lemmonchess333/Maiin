import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks the horizontal scroll position of a scroller so callers can render
 * edge-fade affordances that reflect REAL overflow rather than a static
 * always-on gradient:
 *
 *   - `atStart` is true while the scroller is at (or hasn't moved from) the
 *     left edge — show the LEFT fade only when this is false.
 *   - `atEnd` is true while there is no more content to the right — show the
 *     RIGHT fade only when this is false.
 *
 * When the content fits without overflow both flags are true, so neither fade
 * shows. Re-measures on scroll and on element resize.
 *
 * Reusable, but currently wired only into the workout-session exercise rail
 * (visual-audit wave 1 #5). Attach the returned `ref` to the scrolling
 * element; spread the flags into the fade overlays.
 */
export function useScrollEdges<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  // Default to "both edges reached" so a non-overflowing rail shows no fade
  // on first paint before the first measure.
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    // 1px tolerance absorbs sub-pixel rounding at the extremes.
    const atStart = scrollLeft <= 1;
    const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;
    setEdges((prev) =>
      prev.atStart === atStart && prev.atEnd === atEnd
        ? prev
        : { atStart, atEnd }
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure]);

  return { ref, atStart: edges.atStart, atEnd: edges.atEnd, measure };
}
