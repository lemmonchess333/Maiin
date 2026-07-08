/**
 * Back-to-dismiss — context + hooks so the device/browser BACK affordance
 * closes the topmost open overlay instead of navigating the route away.
 *
 * The provider component lives in `BackDismissProvider.tsx` (split out so this
 * file exports only non-components — react-refresh rule). Overlays call
 * `useBackDismiss`; the provider's native backButton listener (Android) calls
 * `dispatchBack`. See the provider + `scratchpad/spec-back-dismiss.md` for the
 * platform scope (native now, web popstate as a fast-follow).
 */
import { createContext, useContext, useEffect, useRef } from "react";

export interface BackDismissApi {
  /** Register a dismisser; returns an unregister fn. The newest registration
   *  is the top of the stack and is invoked first on back (LIFO). */
  register: (handler: () => void) => () => void;
  /** Invoke the topmost dismisser, if any. Returns true when one handled the
   *  back (so the caller must NOT also navigate). The native backButton
   *  listener calls this; the future web popstate handler will too. */
  dispatchBack: () => boolean;
}

export const BackDismissContext = createContext<BackDismissApi | null>(null);

/**
 * Register `onBack` as the back-dismisser while `active` is true. On back, the
 * topmost active dismisser runs (LIFO) and the navigation is swallowed. The
 * handler always sees the latest `onBack` without re-registering.
 *
 * Non-dismissible overlays (forced-choice prompts) should still call this with
 * a NO-OP `onBack` so their presence swallows the back (traps it) rather than
 * letting it navigate the page away.
 *
 * IDEMPOTENCY CONTRACT: `dispatchBack` invokes the top handler but does NOT pop
 * it — the entry is removed when the overlay's own close causes `active→false`.
 * That means a rapid double back-press (two native events before React commits
 * the close) invokes the SAME handler twice. This is deliberate — it absorbs an
 * accidental double-press instead of cascade-closing the overlay beneath — so
 * `onBack` MUST be idempotent (closing an already-closing overlay is a no-op,
 * which every current wiring satisfies via `setOpen(false)`). A future
 * non-idempotent handler (e.g. "open a Leave-run? confirm") must guard itself.
 *
 * No-ops safely when rendered outside a BackDismissProvider (e.g. isolated
 * component tests) so overlays don't need the provider to render.
 */
export function useBackDismiss(active: boolean, onBack: () => void) {
  const ctx = useContext(BackDismissContext);
  const cb = useRef(onBack);
  useEffect(() => {
    cb.current = onBack;
  });
  useEffect(() => {
    if (!active || !ctx) return;
    return ctx.register(() => cb.current());
  }, [active, ctx]);
}

/** Exposes `dispatchBack` (what the native listener calls) — used by the
 *  provider's interceptor, tests, and the future web popstate handler. */
export function useBackDismissController(): BackDismissApi {
  const ctx = useContext(BackDismissContext);
  if (!ctx)
    throw new Error("useBackDismissController must be used within a provider");
  return ctx;
}
