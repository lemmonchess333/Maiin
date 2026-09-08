import { useState } from "react";
import { useUidForStorageKey } from "@/lib/auth";
import { readString, writeString } from "@/lib/localStore";

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
 * Pass a stable `key` per dismissal surface. Do NOT put the uid in it —
 * see below. Examples:
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
 *
 * ── uid scoping is THIS hook's job, not the caller's ─────────────────
 *
 * localStorage is per-device, so an unscoped dismissal is shared by every
 * account that signs in on that device. CLAUDE.md names this as a
 * recurring mistake (the offline + share queues were fixed for it in
 * #820), and scoping was left to whoever built the key — so of the nine
 * dismissal call sites, six didn't:
 *
 *   - the Home welcome checklist, on a literal constant key, so a second
 *     account on a shared device never saw the onboarding checklist at all
 *   - the deload and recovery-reduction banners, keyed by week — two
 *     people training on one device, same week, and only the first is told
 *     their programme cut load
 *   - the contextual tip banner, keyed by tip
 *   - the challenge finale card, keyed by CHALLENGE id — and challenge ids
 *     are global by construction, so this one collides by design
 *   - every coach mark
 *
 * Prefixing here rather than asking callers to remember is the same fix
 * shape as the sheet that now owns its own eased-week marker: when a
 * caller can forget, stop asking it to.
 */
export function useDismissOnce(key: string): {
  dismissed: boolean;
  dismiss: () => void;
} {
  const scoped = `${useUidForStorageKey()}:${key}`;
  const [state, setState] = useState(() => ({
    key: scoped,
    dismissed: readDismissed(scoped),
  }));

  /* Re-read when the key changes, using React's adjust-state-during-render
     pattern rather than an effect.

     A `useState` initializer runs once, so without this a component that
     stays mounted across a sign-in — and `onAuthStateChanged` fires several
     times per sign-in, so the uid moving under a live tree is ordinary —
     would keep answering with the PREVIOUS account's verdict. Which is the
     exact leak this scoping exists to close, reintroduced one level down. */
  if (state.key !== scoped) {
    setState({ key: scoped, dismissed: readDismissed(scoped) });
  }

  const dismiss = () => {
    setState({ key: scoped, dismissed: true });
    // Best-effort persistence — private mode falls back to in-memory only,
    // which is the right behaviour (no crash, no toast, just a
    // single-session dismissal).
    writeString(scoped, "1");
  };

  return { dismissed: state.dismissed, dismiss };
}

function readDismissed(scopedKey: string): boolean {
  if (typeof window === "undefined") return false;
  return readString(scopedKey) === "1";
}
