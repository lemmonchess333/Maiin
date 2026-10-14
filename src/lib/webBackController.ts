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
  /** Run `fn` once the overlay changes in hand have settled (the provider: a
   *  microtask, after the effects that closed and opened overlays). */
  defer(fn: () => void): void;
  /** The page's URL, to tell a navigation made after an overlay closed. */
  url(): string;
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
  // Sentinels whose overlay closed in place and that are not consumed yet,
  // with the URL at the close. An overlay that opens before they are takes
  // one over rather than pushing its own: a sheet that hands off to the next
  // (a chooser to its form, a form to its confirmation) closes one and
  // opens the other in the same commit. Consumed at once, the close's
  // back() was still queued when the open's pushState ran, and the browser
  // ran the back first, onto the route's own entry: the new sheet's
  // sentinel was never the current entry, and its close then went back
  // past the route. Starting a Circle took the person to the page before
  // Social.
  const dangling: string[] = [];
  let flushQueued = false;

  const flush = () => {
    flushQueued = false;
    while (dangling.length > 0) {
      const closedAt = dangling.pop();
      // The app navigated since the close: the sentinel rides as a middle
      // entry, as for an overlay closed by the navigation itself.
      if (closedAt !== port.url()) continue;
      pendingSelfPops++;
      port.back();
    }
  };

  return {
    onOpen() {
      sentinels++;
      if (dangling.length > 0) {
        dangling.pop(); // a hand-off: the closed overlay's sentinel guards this one
        return;
      }
      port.pushSentinel();
    },

    onClose(viaBack, wasNavigation) {
      if (viaBack) return; // the user's back already popped it (onPop decremented)
      if (sentinels <= 0) return;
      sentinels--;
      if (wasNavigation) return; // sentinel rides as a middle entry; don't undo the nav
      // In-place close (X / backdrop / drag): consume the now-dangling
      // sentinel once this task's opens have had the chance to take it.
      dangling.push(port.url());
      if (!flushQueued) {
        flushQueued = true;
        port.defer(flush);
      }
    },

    onPop() {
      if (pendingSelfPops > 0) {
        pendingSelfPops--;
        return "ignore"; // our own consume
      }
      if (dangling.length > 0) {
        dangling.pop(); // the user popped a sentinel we had yet to consume
        return "ignore";
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
