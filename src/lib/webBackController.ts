/**
 * webBackController — the pure accounting brain for the WEB half of
 * back-to-dismiss (the native half is `BackDismissProvider`'s Capacitor
 * backButton listener).
 *
 * The web platform has no "back button" event — the only pre-navigation signal
 * is a history entry the user can pop. So while overlays are open we keep a
 * "sentinel" history entry per open overlay; the user's browser back pops a
 * sentinel (fires `popstate`) instead of navigating the real route, and we
 * translate that into "close the topmost overlay."
 *
 * This module is PURE: it owns only the counting + the decision of when to
 * push/consume sentinels, against an injected `HistoryPort`. It has NO React,
 * NO real `history`/`popstate` — so every event interleaving is unit-testable
 * deterministically (jsdom can't faithfully replay real popstate timing, and a
 * mis-count here would mis-navigate real users, so the logic is validated in
 * isolation). `BackDismissProvider` binds it to the real API and provides the
 * router-aware `wasNavigation` signal for the navigate-from-overlay case; the
 * end-to-end behaviour is then validated by a Playwright E2E in CI (a real
 * browser), NOT by these unit tests alone.
 *
 * Invariant: `sentinels` == number of currently-open overlays that still have a
 * live sentinel entry in history.
 */

export interface HistoryPort {
  /** Push one sentinel entry (history.pushState of a marker). */
  pushSentinel(): void;
  /** Pop one entry (history.back()) to consume a dangling sentinel. */
  back(): void;
}

export type PopResult = "close-top" | "ignore";

export interface WebBackController {
  /** An overlay opened → guard it with a sentinel. */
  onOpen(): void;
  /**
   * An overlay closed.
   * @param viaBack   true when this close was caused by a user back that
   *                  already popped the sentinel (see onPop) — nothing to
   *                  consume.
   * @param wasNavigation true when the overlay closed because the app
   *                  navigated to a new route (the sentinel is now a harmless
   *                  middle entry that self-consumes on a later back — do NOT
   *                  proactively `back()`, which would undo the navigation).
   */
  onClose(viaBack: boolean, wasNavigation: boolean): void;
  /** A popstate fired → "close-top" if it was a user back on a sentinel,
   *  else "ignore" (our own consume, or a real route navigation). */
  onPop(): PopResult;
  /** Test/introspection: live sentinel count. */
  _count(): number;
}

export function createWebBackController(port: HistoryPort): WebBackController {
  // Sentinels currently in history that correspond to open overlays.
  let sentinels = 0;
  // history.back()s WE initiated (to consume a dangling sentinel), whose
  // resulting popstate must be ignored rather than treated as a user back.
  let pendingSelfPops = 0;

  return {
    onOpen() {
      sentinels++;
      port.pushSentinel();
    },

    onClose(viaBack, wasNavigation) {
      if (viaBack) return; // the user's back already popped it (onPop decremented)
      if (sentinels <= 0) return;
      sentinels--;
      if (wasNavigation) return; // sentinel rides as a middle entry; don't undo the nav
      // In-place close (X / backdrop / drag): consume the now-dangling sentinel.
      pendingSelfPops++;
      port.back();
    },

    onPop() {
      if (pendingSelfPops > 0) {
        pendingSelfPops--;
        return "ignore"; // our own consume
      }
      if (sentinels > 0) {
        sentinels--; // the user popped a sentinel
        return "close-top";
      }
      return "ignore"; // real navigation — let it through
    },

    _count() {
      return sentinels;
    },
  };
}
