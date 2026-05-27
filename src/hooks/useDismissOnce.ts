import { useState } from "react";

/**
 * Generic dismiss-once primitive backed by localStorage.
 *
 * Six+ inline copies of the same pattern were scattered across
 * banners and tip surfaces (WelcomeBackCard, ContextualTipBanner,
 * DeloadBanner, etc.) — each with a slightly different storage key
 * prefix and slightly different try/catch wrapping. Consolidated
 * here so:
 *
 *   - The localStorage access is safe in Safari private mode (try/
 *     catch around both read and write; quota errors are swallowed
 *     because dismissal persistence is a nice-to-have, not load-
 *     bearing).
 *   - The SSR / no-window guard happens in one place.
 *   - Future banner authors get the right behaviour by default.
 *
 * Pass a stable `key` per dismissal surface. Examples:
 *   - "wb-dismissed:2026-05-27" (per-day welcome card)
 *   - "tropos-home-tip-dismissed:race-progress" (per-tip banner)
 *   - "tropos-pgm-deload-dismissed:2026-W21" (per-week deload note)
 *
 * The boolean second element is the in-memory state — the hook
 * re-renders the consumer once on dismiss, then never again.
 *
 * For the slightly different "coach marks" mental model (per-key
 * but with the `showCoachMarks` flipped name + slightly different
 * default storage prefix), see `useCoachMarks`.
 */
export function useDismissOnce(key: string): {
  dismissed: boolean;
  dismiss: () => void;
} {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Best-effort persistence — private mode falls back to in-
      // memory only, which is the right behaviour (no crash, no
      // toast, just a single-session dismissal).
    }
  };

  return { dismissed, dismiss };
}
