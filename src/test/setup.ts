import "@testing-library/jest-dom";

/* jsdom doesn't ship `matchMedia`. `useReducedMotion` calls it on
 * mount; without this stub anything that mounts the hook (Tooltip,
 * Coachmark, RunningNavIcon, etc.) throws under tests. Default
 * `matches: false` so tests assume motion is enabled unless they
 * override per-case. */
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
