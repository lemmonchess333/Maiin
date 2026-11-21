import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept current as the window resizes: a
 * fold or an unfold on the iPhone Duo is a resize of the same page, so a
 * component reading this changes its props, never its identity, and
 * keeps its state. False where there is no `matchMedia` (tests, SSR).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return noop;
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined" && !!window.matchMedia
        ? window.matchMedia(query).matches
        : false,
    () => false
  );
}

function noop() {}
