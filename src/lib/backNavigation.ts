import type { NavigateFunction } from "react-router-dom";

/**
 * Whether this screen was reached from another one in the app. The router
 * keeps each entry's place in the visit on the history entry (`idx`), and a
 * replaced address keeps its place, so a screen opened directly (a
 * notification, a bookmark, a fresh launch) is at 0 however its own
 * address has changed since.
 */
export function cameFromInApp(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  return idx > 0;
}

/**
 * Back to the screen this one was opened from, or, opened directly, to
 * `fallback` in this screen's place.
 */
export function goBackOr(navigate: NavigateFunction, fallback: string): void {
  if (cameFromInApp()) navigate(-1);
  else navigate(fallback, { replace: true });
}
