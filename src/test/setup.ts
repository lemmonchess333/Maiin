import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";

/* Drain post-unmount timers before the jsdom realm is torn down.
 *
 * vaul's Drawer wraps Radix Dialog, whose FocusScope defers its close
 * handling to a `setTimeout(…, 0)` scheduled in the effect CLEANUP — one
 * macrotask AFTER unmount:
 *
 *   return () => { … setTimeout(() => {
 *     const unmountEvent = new CustomEvent(AUTOFOCUS_ON_UNMOUNT, …);
 *     container.dispatchEvent(unmountEvent);        // ← the hazard
 *   }, 0); };
 *
 * If a file ends with that timer pending, Vitest swaps the jsdom
 * environment before it fires. The callback then builds the event from
 * the NEW realm's CustomEvent and dispatches it on a `container`
 * belonging to the OLD one, so jsdom's IDL conversion rejects it:
 *
 *   TypeError: Failed to execute 'dispatchEvent' on 'EventTarget':
 *   parameter 1 is not of type 'Event'
 *
 * That surfaces as an UNHANDLED error, not a test failure — the suite
 * reports every test passing and still exits non-zero, which is a
 * miserable thing to debug from a CI log.
 *
 * Global rather than per-file: 14 suites mount Drawers/Sheets, and the
 * hazard belongs to any future one too. A per-file drain was tried first
 * and the flake simply moved to the next Drawer suite.
 *
 * Hook order works in our favour: Vitest's default `stack` sequencing
 * runs afterEach hooks in REVERSE registration order, and this file is
 * set up before any test file's imports — so RTL's auto-cleanup (and any
 * file-level `afterEach(cleanup)`) unmounts FIRST, scheduling the timer,
 * and this flush drains it afterwards.
 *
 * DOM-guarded: `setup.ts` is shared with the `node` projects, which have
 * no realm to tear down and no Drawer to unmount.
 */
if (typeof document !== "undefined") {
  afterEach(async () => {
    /* Bail under fake timers. Awaiting a real `setTimeout` while a fake
     * clock is installed would never resolve — the hook would hang and
     * time the test out. Skipping is safe: a timer scheduled on a fake
     * clock is discarded with it and never reaches the dispatch. */
    if (vi.isFakeTimers()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

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
