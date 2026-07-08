/**
 * BackDismissProvider — maintains a LIFO stack of overlay "dismissers" and a
 * single NATIVE (Android) back interceptor so the device back button closes the
 * topmost open overlay instead of navigating the route away.
 *
 * Platform scope (first arc): native only. iOS has no back affordance; the WEB
 * interceptor (history sentinel + popstate) is a deliberate fast-follow — the
 * seam is `dispatchBack()`, which a web popstate handler will call exactly as
 * the native listener does. See `scratchpad/spec-back-dismiss.md`.
 */
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { isNativePlatform } from "./platform";
import { BackDismissContext, type BackDismissApi } from "./backDismiss";

/** Lazy handle to the Capacitor App plugin. Dynamic import keeps the native
 *  plugin out of the web bundle; the holder hides Capacitor's proxy from
 *  thenable-probing (same guard as lib/haptic.ts's loadNativeHaptics). */
type CapacitorAppPlugin = {
  addListener: (
    event: "backButton",
    cb: (ev: { canGoBack?: boolean }) => void
  ) => Promise<{ remove: () => void }>;
  exitApp: () => Promise<void>;
};
let appPluginPromise: Promise<{ plugin: CapacitorAppPlugin } | null> | null =
  null;
function loadCapacitorApp(): Promise<{ plugin: CapacitorAppPlugin } | null> {
  if (appPluginPromise) return appPluginPromise;
  appPluginPromise = import("@capacitor/app")
    .then((mod) => {
      const m = mod as unknown as { App?: CapacitorAppPlugin };
      return m?.App ? { plugin: m.App } : null;
    })
    .catch(() => null);
  return appPluginPromise;
}

export function BackDismissProvider({ children }: { children: ReactNode }) {
  // Monotonic id + the live LIFO stack. Refs (not state) so the interceptor
  // always reads the current top without re-subscribing.
  const nextId = useRef(0);
  const stack = useRef<Array<{ id: number; handler: () => void }>>([]);

  const register = useCallback((handler: () => void) => {
    const id = nextId.current++;
    stack.current.push({ id, handler });
    return () => {
      stack.current = stack.current.filter((e) => e.id !== id);
    };
  }, []);

  const dispatchBack = useCallback(() => {
    const top = stack.current[stack.current.length - 1];
    if (!top) return false;
    top.handler();
    return true;
  }, []);

  // Native (Android) interceptor. iOS has no back affordance; web is the
  // deferred fast-follow.
  useEffect(() => {
    if (!isNativePlatform()) return;
    let cancelled = false;
    let handle: { remove: () => void } | null = null;
    void loadCapacitorApp().then((holder) => {
      if (!holder || cancelled) return;
      holder.plugin
        .addListener("backButton", ({ canGoBack }) => {
          if (dispatchBack()) return; // an overlay closed — swallow the back
          if (canGoBack) window.history.back();
          else void holder.plugin.exitApp();
        })
        .then((h) => {
          if (cancelled) h.remove();
          else handle = h;
        });
    });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [dispatchBack]);

  const api = useMemo<BackDismissApi>(
    () => ({ register, dispatchBack }),
    [register, dispatchBack]
  );
  return (
    <BackDismissContext.Provider value={api}>
      {children}
    </BackDismissContext.Provider>
  );
}
